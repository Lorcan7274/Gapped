import { decodeTrack, walkTrack } from '../lib/track.js'
import { cutProfile, compactProfile, timeToCover } from '../lib/ghost.js'
import { publicPlayer, serializeDuel } from '../lib/serialize.js'
import { weekOf, addDays } from '../lib/economy.js'
import { DUEL, RATING } from '../config/game.js'
import { getPlayer } from '../db/players.js'
import { getRun, getTrackData } from '../db/runs.js'
import {
  getDuel, duelsFor, feedFor, createDuel, startReply, rememberGhostMs, settle, DuelError, OPEN_STATUSES,
} from '../db/duels.js'
import { describeSelf } from './me.js'

/** A duel as `viewerId` sees it. */
export function describeDuel(row, viewerId) {
  const players = new Map([row.challenger_id, row.target_id].map((id) => [id, getPlayer(id)]))
  return serializeDuel(row, viewerId, players)
}

/**
 * A run as a ghost over `distanceM`: its distance profile up to the line, and
 * its time there. Distance over time only — never where it was run.
 */
function ghostOf(run, distanceM) {
  const data = getTrackData(run.id)
  if (!data) return null
  const { profile } = walkTrack(decodeTrack(data))
  const cut = cutProfile(profile, distanceM)
  if (!cut) return null
  return { profile: compactProfile(cut), timeMs: Math.round(timeToCover(profile, distanceM)) }
}

const refuse = (reply, status, code, error) => reply.code(status).send({ error, code })

export default async function duelRoutes(app) {
  /**
   * Runs you can race as ghosts: other players' recent non-private solo runs.
   * Phase 4 narrows this to your pool; until pools exist, everyone is one pool.
   */
  app.get('/api/feed', { preHandler: app.requirePlayer }, async (request) => {
    const rows = feedFor(request.player.id, {
      since: Date.now() - DUEL.feedDays * 86_400_000,
      minDistance: DUEL.minDistanceM,
      maxDistance: RATING.maxDistanceM,
      limit: DUEL.feedLimit,
    })
    return {
      fuelCost: DUEL.fuelCost,
      runs: rows.map((r) => ({
        id: r.id,
        player: publicPlayer({
          id: r.player_id, display_name: r.display_name, ladder_tier: r.ladder_tier,
          ladder_division: r.ladder_division, created_at: r.player_created_at,
        }),
        startedAt: r.started_at,
        distanceM: Math.round(r.distance_m),
        timeMs: r.ghost_ms ?? r.elapsed_ms,
      })),
    }
  })

  /** Your duels: everything still open, and what settled in the last few weeks. */
  app.get('/api/duels', { preHandler: app.requirePlayer }, async (request) => {
    const me = request.player.id
    const since = addDays(weekOf(Date.now()), -14)
    // Only an open duel can have come due; settled ones are final.
    const current = (row) => (OPEN_STATUSES.includes(row.status) ? settle(row.id) ?? row : row)
    return { duels: duelsFor(me, { since }).map((row) => describeDuel(current(row), me)) }
  })

  /**
   * Challenge a run: pay the Fuel and start leg one. Returns the ghost to
   * race. The leg's run comes back through POST /api/runs with the duel id.
   */
  app.post('/api/duels', { preHandler: app.requirePlayer }, async (request, reply) => {
    const me = request.player.id
    const run = getRun(String(request.body?.runId ?? ''))
    if (!run || run.player_id === me || run.private || run.status !== 'ok' || run.kind !== 'solo') {
      return refuse(reply, 404, 'run_missing', 'That run cannot be raced.')
    }
    if (run.distance_m < DUEL.minDistanceM || run.distance_m > RATING.maxDistanceM) {
      return refuse(reply, 400, 'run_length', 'That run is too short or too long to race.')
    }
    // The same window the feed offers.
    if (run.started_at < Date.now() - DUEL.feedDays * 86_400_000) {
      return refuse(reply, 400, 'run_stale', 'That run is too old to race.')
    }
    const ghost = ghostOf(run, run.distance_m)
    if (!ghost) return refuse(reply, 404, 'run_missing', 'That run cannot be raced.')
    if (run.ghost_ms == null) rememberGhostMs(run.id, ghost.timeMs)

    let duel
    try {
      duel = createDuel({ challengerId: me, run, ghostMs: ghost.timeMs, fuelCost: DUEL.fuelCost })
    } catch (error) {
      if (error instanceof DuelError) {
        return refuse(reply, error.code === 'fuel_short' ? 402 : 409, error.code, error.message)
      }
      throw error
    }
    return reply.code(201).send({
      duel: describeDuel(duel, me),
      ghost: { ...ghost, distanceM: duel.distance_m },
      player: describeSelf(getPlayer(me)),
    })
  })

  /** Reply to a challenge: start leg two, racing the challenger's run back. */
  app.post('/api/duels/:id/reply', { preHandler: app.requirePlayer }, async (request, reply) => {
    const me = request.player.id
    const current = settle(request.params.id) // Sunday may have closed it
    if (!current || current.target_id !== me) {
      return refuse(reply, 404, 'duel_missing', 'That duel is not yours to reply to.')
    }
    const leg1 = current.leg1_run_id ? getRun(current.leg1_run_id) : null
    const ghost = leg1 ? ghostOf(leg1, current.distance_m) : null
    if (current.status !== 'awaiting' || !ghost) {
      return refuse(reply, 409, 'duel_closed', 'That duel is not waiting for a reply.')
    }
    let duel
    try {
      duel = startReply(current.id, me)
    } catch (error) {
      if (error instanceof DuelError) return refuse(reply, 409, error.code, error.message)
      throw error
    }
    return {
      duel: describeDuel(duel, me),
      // Race exactly the time the challenger set, not the replayed estimate.
      ghost: { ...ghost, timeMs: duel.leg1_ms, distanceM: duel.distance_m },
    }
  })

  app.get('/api/duels/:id', { preHandler: app.requirePlayer }, async (request, reply) => {
    const me = request.player.id
    const duel = getDuel(request.params.id)
    if (!duel || ![duel.challenger_id, duel.target_id].includes(me)) {
      return refuse(reply, 404, 'duel_missing', 'No such duel.')
    }
    return { duel: describeDuel(settle(duel.id) ?? duel, me) }
  })
}
