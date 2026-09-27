import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require = createRequire(import.meta.url)
const maplibreDist = path.dirname(require.resolve('maplibre-gl/dist/maplibre-gl.css'))
const maplibreVersion = require('maplibre-gl/package.json').version
const MAPLIBRE_BASE = `/vendor/maplibre-${maplibreVersion}/`
const MAPLIBRE_FILES = ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']

/**
 * MapLibre (the in-run map) is served as its own unbundled files rather than
 * bundled: its worker is a module it finds next to its own script, which a
 * bundle breaks. They load only when a run starts, and the version is in the
 * path so a new release is never served from an old cache.
 */
function maplibreVendor() {
  return {
    name: 'gapped-maplibre-vendor',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = req.url?.startsWith(MAPLIBRE_BASE) && req.url.slice(MAPLIBRE_BASE.length)
        if (!file || !MAPLIBRE_FILES.includes(file)) return next()
        res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript')
        fs.createReadStream(path.join(maplibreDist, file)).pipe(res)
      })
    },
    generateBundle() {
      for (const file of MAPLIBRE_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `${MAPLIBRE_BASE.slice(1)}${file}`,
          source: fs.readFileSync(path.join(maplibreDist, file)),
        })
      }
    },
  }
}

// In production the API and the built assets are the same origin, so there is
// nothing to configure. This proxy only exists so `npm run dev:client` can
// talk to the Fastify process on 3000.
export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreVendor()],
  define: { __MAPLIBRE_BASE__: JSON.stringify(MAPLIBRE_BASE) },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
