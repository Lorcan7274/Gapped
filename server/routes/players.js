import {
  DISCOVERY_RADIUS_M,
  DISCOVERY_RATING_SPREAD,
  PRESENCE_TTL_MS,
} from '../config.js'
import { isValidCoord } from '../lib/geo.js'
import { publicPlayer, selfPlayer, publicMatch } from '../lib/serialize.js'
import {
  findNearby,
  setLocation,
  leaderboard,
  rankOf,
  getPlayer,
} from '../db/players.js'
import { recentMatchesFor, getLiveMatchFor } from '../db/matches.js'
import { TIERS } from '../lib/elo.js'
import { DISTANCES } from '../lib/validate.js'

export default async function playerRoutes(app) {
  app.get('/api/me', { preHandler: app.requireAuth }, async (request) => {
    const live = getLiveMatchFor(request.player.id)
    return {
      player: selfPlayer(request.player, { rank: rankOf(request.player.id) }),
      liveMatch: live ? publicMatch(live, request.player.id) : null,
    }
  })

  // The phone reports where it is; discovery works off this.
  app.post('/api/me/location', { preHandler: app.requireAuth }, async (request, reply) => {
    const lat = Number(request.body?.lat)
    const lng = Number(request.body?.lng)
    if (!isValidCoord(lat, lng)) {
      return reply.code(400).send({ error: 'lat and lng must be valid coordinates.' })
    }
    const updated = setLocation(request.player.id, lat, lng)
    return { player: selfPlayer(updated, { rank: rankOf(updated.id) }) }
  })

  // Who is nearby, close enough in rating to be worth racing.
  app.get('/api/players/nearby', { preHandler: app.requireAuth }, async (request, reply) => {
    const player = request.player
    if (player.lat == null || player.lng == null) {
      return reply
        .code(409)
        .send({ error: 'Share your location before looking for opponents.' })
    }

    const radiusM = Math.min(
      Number(request.query?.radiusM) || DISCOVERY_RADIUS_M,
      50_000
    )
    const ratingSpread =
      Number(request.query?.ratingSpread) || DISCOVERY_RATING_SPREAD

    const rows = findNearby(player, {
      radiusM,
      ratingSpread,
      presenceTtlMs: PRESENCE_TTL_MS,
    })

    return {
      radiusM,
      ratingSpread,
      players: rows.map((row) => publicPlayer(row)),
    }
  })

  app.get('/api/players/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const row = getPlayer(request.params.id)
    if (!row) return reply.code(404).send({ error: 'No such player.' })
    return {
      player: publicPlayer(row, { rank: rankOf(row.id) }),
      matches: recentMatchesFor(row.id, 10).map((m) => publicMatch(m, row.id)),
    }
  })

  app.get('/api/leaderboard', async (request) => {
    const limit = Math.min(Number(request.query?.limit) || 50, 100)
    const offset = Math.max(Number(request.query?.offset) || 0, 0)
    const rows = leaderboard({ limit, offset })
    return {
      limit,
      offset,
      players: rows.map((row, i) => publicPlayer(row, { rank: offset + i + 1 })),
    }
  })

  app.get('/api/me/matches', { preHandler: app.requireAuth }, async (request) => {
    const rows = recentMatchesFor(request.player.id, 25)
    return { matches: rows.map((row) => publicMatch(row, request.player.id)) }
  })

  // Static reference data the client renders against.
  app.get('/api/meta', async () => ({
    tiers: TIERS.map(({ key, name, floor, colour }) => ({ key, name, floor, colour })),
    distances: DISTANCES,
    discovery: {
      radiusM: DISCOVERY_RADIUS_M,
      ratingSpread: DISCOVERY_RATING_SPREAD,
    },
  }))
}
