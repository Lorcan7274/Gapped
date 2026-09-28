import { parseTrack, summariseTrack, walkTrack, encodeTrack, decodeTrack, TrackError } from '../lib/track.js'
import {
  localDay, weekOf, intensity, streakOf, soloRewards, countsForStreak,
} from '../lib/economy.js'
import { timeToCover } from '../lib/ghost.js'
import { serializeRun } from '../lib/serialize.js'
import { DUEL, STREAK } from '../config/game.js'
import { getPlayer } from '../db/players.js'
import {
  findRunByStart, findOverlappingRun, streakDays, earnedOn, recordRun, recentRuns,
} from '../db/runs.js'
import { getDuel, recordLeg, settle, DuelError } from '../db/duels.js'
import { describeSelf } from './me.js'
import { describeDuel } from './duels.js'

// A two-hour run at one fix a second is ~0.5 MB of JSON; leave room.
const RUN_BODY_LIMIT = 8 * 1024 * 1024

/**
 * Which leg of which duel an uploaded run is, or null if it is not one —
 * the duel has settled (Sunday passed, or the leg was walked away from), or
 * the run started before the leg did, well after it (another attempt), or
 * after the duel's week was over. A
 * run that cannot be a leg is still a run: it is stored and paid as solo.
 */
function legFor(duelId, playerId, startedAt) {
  if (!duelId) return null
  const duel = settle(String(duelId)) // closes it first if its Sunday has passed
  if (!duel) return null
  const leg =
    duel.challenger_id === playerId && duel.status === 'leg1' && !duel.leg1_quit ? 1
    : duel.target_id === playerId && duel.status === 'leg2' ? 2
    : null
  if (!leg) return null
  const legStart = leg === 1 ? duel.leg1_started_at : duel.leg2_started_at
  // One attempt per leg: the run that began when the leg did, not the best of several.
  if (startedAt < legStart - DUEL.startSlackMs || startedAt > legStart + DUEL.startWindowMs) return null
  // Running across Sunday midnight is fine; starting after it is not.
  if (weekOf(startedAt - DUEL.startSlackMs) > duel.week) return null
  return { duel, leg }
}

export default async function runRoutes(app) {
  /**
   * Upload a finished run. The phone sends the raw fixes it saw; the server
   * recomputes distance and time from them, checks plausibility, and pays
   * out Shards, Fuel and streak. A solo run also pays a few pool points; a
   * duel leg (`duelId`) pays its points when the duel settles instead.
   *
   * Solo never costs anything: a flagged run is stored and settles unranked
   * — it pays nothing and is marked for review — but it takes nothing away
   * either. A flagged duel leg counts as a quit. The phone retries uploads, so
   * the same run twice returns the first.
   */
  app.post('/api/runs', { preHandler: app.requirePlayer, bodyLimit: RUN_BODY_LIMIT }, async (request, reply) => {
    let points
    try {
      // Measured at storage precision, so a replay of the stored track
      // (a ghost, a review) reproduces exactly the numbers settled on.
      points = decodeTrack(encodeTrack(parseTrack(request.body?.track, { now: Date.now() })))
    } catch (error) {
      if (error instanceof TrackError) return reply.code(400).send({ error: error.message, code: error.code })
      throw error
    }
    const summary = summariseTrack(points)
    const playerId = request.player.id

    const existing = findRunByStart(playerId, summary.startedAt)
    if (existing) {
      // Only a duel this run is actually a leg of; otherwise it counted as solo.
      const duel = request.body?.duelId ? getDuel(String(request.body.duelId)) : null
      const isLeg = Boolean(duel) && [duel.leg1_run_id, duel.leg2_run_id].includes(existing.id)
      return {
        run: serializeRun(existing),
        player: describeSelf(getPlayer(playerId)),
        duel: isLeg ? describeDuel(duel, playerId) : null,
        ...(request.body?.duelId && !isLeg ? { duelClosed: true } : {}),
        duplicate: true,
      }
    }

    // One run sent again with a fix or two trimmed off is not a new run: a
    // player cannot be in two runs at once, so an overlap is refused.
    if (findOverlappingRun(playerId, summary.startedAt, summary.endedAt)) {
      return reply.code(409).send({
        error: 'That run overlaps one already saved.',
        code: 'run_overlap',
      })
    }

    const player = getPlayer(playerId)
    const leg = legFor(request.body?.duelId, playerId, summary.startedAt)
    const day = localDay(summary.startedAt)
    const minutes = summary.elapsedMs / 60_000
    const quarantined = summary.flags.length > 0
    const effort = intensity(player.mmr, summary.distanceM, summary.elapsedMs)
    const before = { days: player.streak_days, lastDay: player.streak_last_day }
    const streak = !quarantined && countsForStreak(minutes, summary.distanceM)
      ? streakOf([day, ...streakDays(playerId, { minDistance: STREAK.minDistanceM, minMs: STREAK.minMinutes * 60_000 })])
      : before
    const rewards = quarantined
      ? { shards: 0, fuel: 0, points: 0 }
      : soloRewards({ minutes, intensity: effort, streakDays: streak.days, today: earnedOn(playerId, day) })
    const { profile } = walkTrack(points)

    const runInput = {
      run: {
        player_id: playerId,
        kind: leg ? 'duel' : 'solo',
        private: !leg && request.body?.private ? 1 : 0,
        started_at: summary.startedAt,
        ended_at: summary.endedAt,
        day,
        week: weekOf(summary.startedAt),
        distance_m: summary.distanceM,
        elapsed_ms: summary.elapsedMs,
        status: quarantined ? 'quarantined' : 'ok',
        flags: quarantined ? JSON.stringify(summary.flags) : null,
        intensity: effort,
        shards: rewards.shards,
        fuel: rewards.fuel,
        // A leg's points come from the duel.
        points: leg ? 0 : rewards.points,
        ghost_ms: summary.distanceM > 0 ? timeToCover(profile, summary.distanceM) : null,
      },
      track: { format: 1, samples: points.length, hasSteps: summary.hasSteps, data: encodeTrack(points) },
      credit: { metres: quarantined ? 0 : summary.distanceM, streak },
    }

    let run
    let duel = null
    if (leg) {
      // A leg is timed to the duel's distance. One that stops short is a
      // quit, and so is one the runner ended on purpose before the line —
      // and so is a flagged one, quietly: tripping a flag is never better
      // than quitting, and the opponent still gets their result.
      const reached = profile.at(-1)?.[1] ?? 0
      const ms = quarantined || (request.body?.quit && reached < leg.duel.distance_m)
        ? null
        : timeToCover(profile, leg.duel.distance_m)
      try {
        ;({ run, duel } = recordLeg({ duelId: leg.duel.id, leg: leg.leg, ms, runInput }))
      } catch (error) {
        if (!(error instanceof DuelError)) throw error
      }
    }
    if (!run) run = recordRun({ ...runInput, run: { ...runInput.run, kind: 'solo', points: rewards.points } })
    if (quarantined) request.log.warn({ runId: run.id, playerId, flags: summary.flags }, 'run quarantined')

    return reply.code(201).send({
      run: serializeRun(run),
      player: describeSelf(getPlayer(playerId)),
      duel: duel ? describeDuel(duel, playerId) : null,
      // Why a run paid less than it might have: today's caps were reached.
      capped: Boolean(rewards.capped),
      // A run from before this week's Monday (uploaded late) paid last week's table.
      lastWeek: run.week < weekOf(Date.now()),
      // Asked to be a leg but could not be: the run counted as solo.
      ...(request.body?.duelId && !duel ? { duelClosed: true } : {}),
    })
  })

  app.get('/api/me/runs', { preHandler: app.requirePlayer }, async (request) => ({
    runs: recentRuns(request.player.id, 30).map(serializeRun),
  }))
}
