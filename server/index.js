import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'

import { PORT, HOST, DATABASE_PATH, IS_PRODUCTION } from './config.js'
import { MIGRATED } from './db/index.js'
import { getPlayer, touchPlayer } from './db/players.js'
import joinRoutes from './routes/join.js'
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

/* --------------------------------------------------------------- identity */

// The player id handed back at join — kept in localStorage by the client —
// is the credential. It arrives as the x-player-id header, or as playerId in
// the body for convenience. A 404 (not 401) tells the client the id is dead
// and it should clear storage and show the join screen again.
app.decorate('requirePlayer', async (request, reply) => {
  const id = request.headers['x-player-id'] || request.body?.playerId
  const player = getPlayer(id)
  if (!player) {
    return reply
      .code(404)
      .send({ error: 'That player no longer exists. Join again.', code: 'unknown_player' })
  }
  touchPlayer(player.id)
  request.player = player
})
app.decorateRequest('player', null)

/* --------------------------------------------------------------- routes */

// Railway injects the commit it built from. Surfacing it here is the only
// way to tell, from outside, whether a push actually reached production —
// a failed build leaves the previous version live and looking perfectly fine.
const BUILD = {
  commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || 'unknown',
  branch: process.env.RAILWAY_GIT_BRANCH || 'unknown',
  message: (process.env.RAILWAY_GIT_COMMIT_MESSAGE || '').split('\n')[0] || null,
  startedAt: new Date().toISOString(),
}

app.get('/api/health', async () => ({
  ok: true,
  uptimeSeconds: Math.round(process.uptime()),
  build: BUILD,
}))

// The hub is created before the routes so a join can push the new player
// list straight out over the sockets.
const hub = createHub(app.log)

await app.register(joinRoutes(() => hub.broadcastPlayers()))
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

hub.reconcileOnBoot()

// Fastify owns the HTTP server; we take the raw upgrade for /ws ourselves.
app.server.on('upgrade', (request, socket, head) => {
  hub.handleUpgrade(request, socket, head)
})

/* -------------------------------------------------------------- startup */

async function shutdown(signal) {
  app.log.info({ signal }, 'shutting down')
  hub.close()
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

try {
  await app.listen({ port: PORT, host: HOST })
  if (MIGRATED) app.log.warn('database was migrated off the phone-login schema')
  app.log.info({ port: PORT, database: DATABASE_PATH }, 'gap is up')
} catch (error) {
  app.log.error(error, 'failed to start')
  process.exit(1)
}
