import { normaliseDisplayName, normaliseCoords } from '../lib/validate.js'
import { selfPlayer } from '../lib/serialize.js'
import {
  setLocation,
  renamePlayer,
  rankOf,
  allPlayers,
} from '../db/players.js'
import { publicPlayer } from '../lib/serialize.js'

export default function joinRoutes(broadcastPlayers) {
  return async function routes(app) {
    /**
     * Re-hydrate the signed-in player on reload. A dead session (expired,
     * signed out, or the player removed) returns 404 so the client can clear
     * storage and show sign-in again instead of hanging.
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
      // Resolved from the session like every other route, so nobody can
      // read the list from another player's perspective.
      const viewer = app.resolvePlayer(request)
      return {
        players: allPlayers().map((row) => publicPlayer(row, viewer)),
      }
    })
  }
}
