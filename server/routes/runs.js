import { parseTrack, summariseTrack, encodeTrack, TrackError } from '../lib/track.js'
import {
  localDay, weekOf, intensity, nextStreak, soloRewards, countsForStreak,
} from '../lib/economy.js'
import { serializeRun } from '../lib/serialize.js'
import { getPlayer } from '../db/players.js'
import { findRunByStart, earnedOn, recordRun, recentRuns } from '../db/runs.js'
import { describeSelf } from './me.js'

// A two-hour run at one fix a second is ~0.5 MB of JSON; leave room.
const RUN_BODY_LIMIT = 8 * 1024 * 1024

export default async function runRoutes(app) {
  /**
   * Upload a finished solo run. The phone sends the raw fixes it saw; the
   * server recomputes distance and time from them, checks plausibility, and
   * pays out Shards, Fuel and a few pool points. Solo never costs anything:
   * a flagged run is stored and settles unranked — it pays nothing and is
   * marked for review — but it takes nothing away either. The phone retries
   * uploads, so the same run twice returns the first.
   */
  app.post('/api/runs', { preHandler: app.requirePlayer, bodyLimit: RUN_BODY_LIMIT }, async (request, reply) => {
    let points
    try {
      points = parseTrack(request.body?.track, { now: Date.now() })
    } catch (error) {
      if (error instanceof TrackError) return reply.code(400).send({ error: error.message, code: error.code })
      throw error
    }
    const summary = summariseTrack(points)
    const playerId = request.player.id

    const existing = findRunByStart(playerId, summary.startedAt)
    if (existing) {
      return { run: serializeRun(existing), player: describeSelf(getPlayer(playerId)), duplicate: true }
    }

    const player = getPlayer(playerId)
    const day = localDay(summary.startedAt)
    const minutes = summary.elapsedMs / 60_000
    const quarantined = summary.flags.length > 0
    const effort = intensity(player.mmr, summary.distanceM, summary.elapsedMs)
    const before = { days: player.streak_days, lastDay: player.streak_last_day }
    const streak = !quarantined && countsForStreak(minutes) ? nextStreak(before, day) : before
    const rewards = quarantined
      ? { shards: 0, fuel: 0, points: 0 }
      : soloRewards({ minutes, intensity: effort, streakDays: streak.days, today: earnedOn(playerId, day) })

    const run = recordRun({
      run: {
        player_id: playerId,
        kind: 'solo',
        private: request.body?.private ? 1 : 0,
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
        points: rewards.points,
      },
      track: { format: 1, samples: points.length, hasSteps: summary.hasSteps, data: encodeTrack(points) },
      credit: { metres: quarantined ? 0 : summary.distanceM, streak },
    })
    if (quarantined) request.log.warn({ runId: run.id, playerId, flags: summary.flags }, 'run quarantined')

    return reply.code(201).send({ run: serializeRun(run), player: describeSelf(getPlayer(playerId)) })
  })

  app.get('/api/me/runs', { preHandler: app.requirePlayer }, async (request) => ({
    runs: recentRuns(request.player.id, 30).map(serializeRun),
  }))
}
