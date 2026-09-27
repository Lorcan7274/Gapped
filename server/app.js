import Fastify from 'fastify'
import { getPlayer, touchPlayer, createPlayer } from './db/players.js'
import { registerAuth, playerIdForRequest } from './auth/index.js'
import { normaliseDisplayName } from './lib/validate.js'
import meRoutes, { describeSelf } from './routes/me.js'
import runRoutes from './routes/runs.js'

/**
 * The HTTP API, without listening or serving the client — so tests can
 * drive it with inject() against a throwaway database. server/index.js adds
 * the static client, the WebSocket hub and the listener.
 */
export async function buildApp(options = {}) {
  const app = Fastify({ trustProxy: true, ...options })

  // Who is calling, or null. The session token from sign-in is the only
  // credential; auth/ turns it into a player id.
  app.decorate('resolvePlayer', (request) => getPlayer(playerIdForRequest(request)))

  // The guard for routes that need a caller. A 404 (not 401) tells the client
  // the credential is dead and it should clear storage and show sign-in again.
  app.decorate('requirePlayer', async (request, reply) => {
    const player = app.resolvePlayer(request)
    if (!player) {
      return reply
        .code(404)
        .send({ error: 'That player no longer exists. Sign in again.', code: 'unknown_player' })
    }
    touchPlayer(player.id)
    request.player = player
  })
  app.decorateRequest('player', null)

  await registerAuth(app, {
    createPlayer: ({ displayName }) => {
      const name = normaliseDisplayName(displayName)
      return name ? createPlayer({ displayName: name }).id : null
    },
    describePlayer: (playerId) => describeSelf(getPlayer(playerId)),
  })
  await app.register(meRoutes)
  await app.register(runRoutes)
  return app
}
