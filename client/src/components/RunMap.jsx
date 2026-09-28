import { useEffect, useRef, useState } from 'react'
import { run } from '../lib/run.js'
import { useTheme } from '../lib/theme.js'
import { mapStyle, cityLayers, applyTheme, CITY_SOURCE, EMPTY } from '../lib/mapStyle.js'
import { heading, ghostPoint } from '../lib/routeGeo.js'

/* global __MAPLIBRE_BASE__ */
let loading = null
/** MapLibre, loaded once, the first time a run starts (see vite.config.js). */
function loadMapLibre() {
  if (!loading) {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = `${__MAPLIBRE_BASE__}maplibre-gl.css`
    document.head.appendChild(css)
    loading = import(/* @vite-ignore */ `${__MAPLIBRE_BASE__}maplibre-gl.mjs`)
  }
  return loading
}

const PITCH = 62
const ZOOM = 17

/**
 * The run on a tilted 3D map that follows you and turns with you: your route
 * so far, you, and — in a duel — the ghost, drawn on your own route as far
 * ahead or behind as the gap. Purely a view of the run store; it holds no
 * run state. If the map cannot load (no WebGL, no tiles), the screen works
 * without it — the numbers never depend on it.
 */
export default function RunMap({ state, className = '' }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  // Set once the style has loaded; from then on it can be recoloured.
  const styledRef = useRef(false)
  const bearingRef = useRef(0)
  const [failed, setFailed] = useState(false)
  const { theme } = useTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    let cancelled = false
    let map = null
    loadMapLibre()
      .then(({ Map }) => {
        if (cancelled || !box.current) return
        map = new Map({
          container: box.current,
          style: mapStyle(theme),
          center: [-6.26, 53.34],
          zoom: ZOOM,
          pitch: PITCH,
          maxPitch: 70,
          interactive: false,
          attributionControl: { compact: true },
          fadeDuration: 0,
        })
        // Tiles that fail (offline, a dead zone) are not fatal: the route
        // and markers are local and keep drawing on the plain ground.
        map.on('error', () => {})
        map.once('load', () => {
          map.addSource('omt', CITY_SOURCE)
          for (const layer of cityLayers(themeRef.current)) map.addLayer(layer, 'route-glow')
          // The theme may have changed while the style loaded.
          applyTheme(map, themeRef.current)
          styledRef.current = true
        })
        mapRef.current = map
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
      styledRef.current = false
    }
    // The map is built once per run; the theme is swapped in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Not map.loaded(): that is false whenever tiles are loading, which, with
  // the camera following every fix, is most of a run.
  useEffect(() => {
    if (styledRef.current) applyTheme(mapRef.current, theme)
  }, [theme])

  // Follow the runner on every new fix.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      const path = run.path()
      if (!path.length) return
      const coords = path.map((p) => [p.lng, p.lat])
      const last = path.at(-1)
      const marks = [{ type: 'Feature', properties: { kind: 'me' }, geometry: { type: 'Point', coordinates: [last.lng, last.lat] } }]
      if (state.mode === 'duel' && state.elapsedMs > 0) {
        const g = ghostPoint(path, state.gapM)
        if (g) marks.push({ type: 'Feature', properties: { kind: 'ghost' }, geometry: { type: 'Point', coordinates: [g.lng, g.lat] } })
      }
      map.getSource('route')?.setData(
        coords.length > 1 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } : EMPTY
      )
      map.getSource('marks')?.setData({ type: 'FeatureCollection', features: marks })

      // Turn with the runner, gently: the shortest way round, a little at a time.
      const dir = heading(path)
      if (dir != null) {
        const prev = bearingRef.current
        const delta = ((dir - prev + 540) % 360) - 180
        bearingRef.current = (prev + delta * 0.35 + 360) % 360
      }
      const h = box.current?.clientHeight ?? 0
      map.easeTo({
        center: [last.lng, last.lat],
        bearing: bearingRef.current,
        // Sit the runner in the lower part of the map, with the road ahead above.
        padding: { top: h * 0.35, bottom: 0, left: 0, right: 0 },
        duration: 900,
        easing: (t) => t,
      })
    }
    if (map.getSource('route')) draw()
    else map.once('load', draw)
  }, [state.fixes, state.gapM, state.mode, state.elapsedMs > 0])

  return (
    <div className={`relative overflow-hidden bg-rule ${className}`}>
      {/* Inline, because MapLibre's stylesheet sets its container to position: relative. */}
      {!failed && <div ref={box} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />}
    </div>
  )
}
