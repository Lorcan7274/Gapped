import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../lib/theme.js'
import { mapStyle, cityLayers, applyTheme, CITY_SOURCE } from '../lib/mapStyle.js'
import { loadMapLibre } from './RunMap.jsx'

/**
 * A finished run's route, flat and still, framed to fit: the same paper-and-
 * ink map as the run itself, with a dot where you stopped. `route` is
 * [lng, lat] pairs. If the map cannot load, the box stays a quiet rule.
 */
export default function RouteMap({ route, className = '' }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const styledRef = useRef(false)
  const [failed, setFailed] = useState(false)
  const { theme } = useTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    if (!route.length) return
    let cancelled = false
    let map = null
    loadMapLibre()
      .then(({ Map, LngLatBounds }) => {
        if (cancelled || !box.current) return
        const bounds = route.reduce((b, p) => b.extend(p), new LngLatBounds(route[0], route[0]))
        map = new Map({
          container: box.current,
          style: mapStyle(themeRef.current),
          bounds,
          fitBoundsOptions: { padding: 32, maxZoom: 17 },
          interactive: false,
          attributionControl: { compact: true },
          fadeDuration: 0,
        })
        map.on('error', () => {})
        map.once('load', () => {
          map.getSource('route').setData({
            type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route },
          })
          map.getSource('marks').setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: { kind: 'me' }, geometry: { type: 'Point', coordinates: route.at(-1) } }],
          })
          map.addSource('omt', CITY_SOURCE)
          for (const layer of cityLayers(themeRef.current)) map.addLayer(layer, 'route-glow')
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
  }, [route])

  useEffect(() => {
    if (styledRef.current) applyTheme(mapRef.current, theme)
  }, [theme])

  return (
    <div className={`relative overflow-hidden bg-rule ${className}`}>
      {!failed && <div ref={box} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />}
    </div>
  )
}
