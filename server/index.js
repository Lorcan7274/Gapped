import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'

import { PORT, HOST, DATABASE_PATH, IS_PRODUCTION } from './config/env.js'
import { APPLIED_MIGRATIONS } from './db/index.js'
import { purgeExpired } from './auth/index.js'
import { buildApp } from './app.js'
import { createHub } from './ws/hub.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.join(here, '..', 'client', 'dist')

const app = await buildApp({
  logger: { level: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug') },
})

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

// Live friend duels run over the WebSocket hub; everything else is HTTP.
const hub = createHub(app.log)

/* ------------------------------------------------- static Vite frontend */

// Same origin as the API, so there is nothing to configure for CORS.
if (fs.existsSync(clientDist)) {
  // wildcard:true resolves files from disk per request. With wildcard:false
  // the plugin routes only the files present at boot, so a client rebuild
  // under a running server served index.html in place of the new hashed
  // bundle — a blank page until the process restarted.
  await app.register(fastifyStatic, { root: clientDist, wildcard: true })

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

const housekeeping = setInterval(purgeExpired, 3_600_000)
housekeeping.unref()

async function shutdown(signal) {
  clearInterval(housekeeping)
  app.log.info({ signal }, 'shutting down')
  hub.close()
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

try {
  await app.listen({ port: PORT, host: HOST })
  if (APPLIED_MIGRATIONS.length > 0) {
    app.log.warn(
      { migrations: APPLIED_MIGRATIONS.map((m) => `${m.version}_${m.name}`) },
      'database migrated'
    )
  }
  app.log.info({ port: PORT, database: DATABASE_PATH }, 'gapped is up')
} catch (error) {
  app.log.error(error, 'failed to start')
  process.exit(1)
}
