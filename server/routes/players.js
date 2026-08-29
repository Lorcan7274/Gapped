import {
  DISCOVERY_RADIUS_M,
  DISCOVERY_RATING_SPREAD,
  PRESENCE_TTL_MS,
} from '../config.js'
import { publicPlayer, selfPlayer, publicMatch } from '../lib/serialize.js'
import { findNearby, leaderboard, rankOf, getPlayer } from '../db/players.js'
import { recentMatchesFor, getLiveMatchFor } from '../db/matches.js'
import { TIERS, STARTING_RATING } from '../lib/elo.js'
import { DISTANCES, DURATION_MINUTES } from '../lib/validate.js'

export default async function playerRoutes(app) {
  /** Opponents nearby and close in rating. Needs a position on both sides. */
  app.get('/api/players/nearby', { preHandler: app.requirePlayer }, async (request, reply) => {
    const player = request.player
    if (player.lat == null || player.lng == null) {
      return reply
        .code(409)
        .send({ error: 'Share your location to find opponents.', code: 'no_location' })
    }

    const radiusM = Math.min(Number(request.query?.radiusM) || DISCOVERY_RADIUS_M, 50_000)
    const ratingSpread = Number(request.query?.ratingSpread) || DISCOVERY_RATING_SPREAD

    const rows = findNearby(player, { radiusM, ratingSpread, presenceTtlMs: PRESENCE_TTL_MS })
    return { radiusM, ratingSpread, players: rows.map((row) => publicPlayer(row, player)) }
  })

  app.get('/api/players/:id', async (request, reply) => {
    const row = getPlayer(request.params.id)
    if (!row) return reply.code(404).send({ error: 'No such player.' })
    const viewer = getPlayer(request.headers['x-player-id'])
    return {
      player: publicPlayer(row, viewer, { rank: rankOf(row.id) }),
      matches: recentMatchesFor(row.id, 10).map((m) => publicMatch(m, row.id)),
    }
  })

  app.get('/api/leaderboard', async (request) => {
    const limit = Math.min(Number(request.query?.limit) || 50, 100)
    const offset = Math.max(Number(request.query?.offset) || 0, 0)
    return {
      limit,
      offset,
      players: leaderboard({ limit, offset }).map((row, i) =>
        publicPlayer(row, null, { rank: offset + i + 1 })
      ),
    }
  })

  app.get('/api/me/matches', { preHandler: app.requirePlayer }, async (request) => ({
    matches: recentMatchesFor(request.player.id, 25).map((row) =>
      publicMatch(row, request.player.id)
    ),
  }))

  app.get('/api/me/live-match', { preHandler: app.requirePlayer }, async (request) => {
    const live = getLiveMatchFor(request.player.id)
    return { liveMatch: live ? publicMatch(live, request.player.id) : null }
  })

  /** Reference data the client renders against. */
  app.get('/api/meta', async () => ({
    startingRating: STARTING_RATING,
    tiers: TIERS.map(({ key, name, floor, colour }) => ({ key, name, floor, colour })),
    distances: DISTANCES,
    durationsMinutes: DURATION_MINUTES,
    discovery: { radiusM: DISCOVERY_RADIUS_M, ratingSpread: DISCOVERY_RATING_SPREAD },
  }))
}
