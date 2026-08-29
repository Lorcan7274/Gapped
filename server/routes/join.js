import { normaliseDisplayName, normaliseCoords } from '../lib/validate.js'
import { selfPlayer } from '../lib/serialize.js'
import {
  createPlayer,
  getPlayer,
  setLocation,
  renamePlayer,
  rankOf,
  allPlayers,
} from '../db/players.js'
import { publicPlayer } from '../lib/serialize.js'

export default function joinRoutes(broadcastPlayers) {
  return async function routes(app) {
    /**
     * Join. Creates a player and hands back the record the client keeps in
     * localStorage — the id in it is the credential for every later call.
     * Coordinates are optional: a denied permission still joins.
     */
    app.post('/api/join', async (request, reply) => {
      const displayName = normaliseDisplayName(request.body?.displayName)
      if (!displayName) {
        return reply
          .code(400)
          .send({ error: 'Pick a name between 2 and 24 characters.' })
      }

      const coords = normaliseCoords(request.body?.lat, request.body?.lng)
      const player = createPlayer({
        displayName,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })

      request.log.info(
        { playerId: player.id, located: Boolean(coords) },
        'player joined'
      )
      // Everyone already on the home screen should see the new arrival.
      broadcastPlayers()

      return reply.code(201).send({ player: selfPlayer(player, { rank: rankOf(player.id) }) })
    })

    /**
     * Re-hydrate a stored player on reload. A stale id (database reset, or a
     * player removed) returns 404 so the client can clear localStorage and
     * send the person back to the join screen instead of hanging.
     */
    app.get('/api/me', { preHandler: app.requirePlayer }, async (request) => ({
      player: selfPlayer(request.player, { rank: rankOf(request.player.id) }),
    }))

    /**
     * Position updates: sent at join and again every time the home screen
     * mounts. Absent or denied coordinates are accepted and simply ignored,
     * so the client never has to special-case a refusal.
     */
    app.post('/api/location', { preHandler: app.requirePlayer }, async (request) => {
      const coords = normaliseCoords(request.body?.lat, request.body?.lng)
      if (!coords) {
        return {
          player: selfPlayer(request.player, { rank: rankOf(request.player.id) }),
          stored: false,
        }
      }
      const updated = setLocation(request.player.id, coords.lat, coords.lng)
      broadcastPlayers()
      return {
        player: selfPlayer(updated, { rank: rankOf(updated.id) }),
        stored: true,
      }
    })

    app.patch('/api/me/name', { preHandler: app.requirePlayer }, async (request, reply) => {
      const displayName = normaliseDisplayName(request.body?.displayName)
      if (!displayName) {
        return reply.code(400).send({ error: 'Pick a name between 2 and 24 characters.' })
      }
      const updated = renamePlayer(request.player.id, displayName)
      broadcastPlayers()
      return { player: selfPlayer(updated, { rank: rankOf(updated.id) }) }
    })

    /** Everyone who has joined. The socket pushes this same shape on change. */
    app.get('/api/players', async (request) => {
      const viewerId = request.headers['x-player-id']
      const viewer = getPlayer(viewerId)
      return {
        players: allPlayers().map((row) => publicPlayer(row, viewer)),
      }
    })
  }
}
