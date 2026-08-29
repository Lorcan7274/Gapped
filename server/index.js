import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'

import { PORT, HOST, DATABASE_PATH, IS_PRODUCTION } from './config.js'
import { resolveSession, purgeExpiredSessions } from './db/auth.js'
import { getPlayer, touchPlayer } from './db/players.js'
import authRoutes from './routes/auth.js'
import playerRoutes from './routes/players.js'
import { createHub } from './ws/hub.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.join(here, '..', 'client', 'dist')

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug'),
    ...(IS_PRODUCTION ? {} : { transport: undefined }),
  },
  trustProxy: true,
})

/* ----------------------------------------------------------------- auth */

// Attaches request.player, or 401s. Bearer token issued by /api/auth/verify.
app.decorate('requireAuth', async (request, reply) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  const session = resolveSession(token)
  const player = session ? getPlayer(session.player_id) : null
  if (!player) {
    return reply.code(401).send({ error: 'Sign in to continue.' })
  }
  touchPlayer(player.id)
  request.player = player
  request.sessionToken = token
})
app.decorateRequest('player', null)
app.decorateRequest('sessionToken', null)

/* --------------------------------------------------------------- routes */

app.get('/api/health', async () => ({
  ok: true,
  uptimeSeconds: Math.round(process.uptime()),
}))

await app.register(authRoutes)
await app.register(playerRoutes)

/* ------------------------------------------------- static Vite frontend */

// Same origin as the API, so there is nothing to configure for CORS.
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist, wildcard: false })

  // Client-side routing: anything that is not an API call or a real file
  // falls through to the SPA shell.
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found.' })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.log.warn(
    { clientDist },
    'no client build found — run `npm run build` (the API still works)'
  )
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: 'Not found. The frontend has not been built.' })
  )
}

/* ------------------------------------------------------------ websockets */

const hub = createHub(app.log)
hub.reconcileOnBoot()

// Fastify owns the HTTP server; we take the raw upgrade for /ws ourselves.
app.server.on('upgrade', (request, socket, head) => {
  hub.handleUpgrade(request, socket, head)
})

/* -------------------------------------------------------------- startup */

const housekeeping = setInterval(purgeExpiredSessions, 3_600_000)
housekeeping.unref()

async function shutdown(signal) {
  app.log.info({ signal }, 'shutting down')
  clearInterval(housekeeping)
  hub.close()
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

try {
  await app.listen({ port: PORT, host: HOST })
  app.log.info({ port: PORT, database: DATABASE_PATH }, 'gap is up')
} catch (error) {
  app.log.error(error, 'failed to start')
  process.exit(1)
}
