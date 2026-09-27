import { distanceMetres } from './tracker.js'

/**
 * Small geometry for drawing a run on the map: where along your own route a
 * ghost is, and which way you are heading. Ghosts carry no coordinates, so a
 * ghost is drawn on *your* route — as far back (or ahead) as the gap says.
 */

const toRad = (d) => (d * Math.PI) / 180
const toDeg = (r) => (r * 180) / Math.PI

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** The point `metres` from `p` along `deg`. */
export function offset(p, deg, metres) {
  const r = 6_371_000
  const d = metres / r
  const th = toRad(deg)
  const lat1 = toRad(p.lat)
  const lng1 = toRad(p.lng)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(th))
  const lng2 = lng1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: toDeg(lat2), lng: toDeg(lng2) }
}

/** Heading over the last stretch of at least `minM` metres; null until you have moved. */
export function heading(path, minM = 12) {
  if (path.length < 2) return null
  const last = path.at(-1)
  for (let i = path.length - 2; i >= 0; i--) {
    if (distanceMetres(path[i], last) >= minM) return bearing(path[i], last)
  }
  return null
}

/**
 * Where the ghost is on your route: `gapM` metres behind your latest point
 * (positive gap — you are ahead), walking back along the route; or ahead of
 * you along your current heading when you are behind.
 */
export function ghostPoint(path, gapM) {
  if (!path.length || gapM == null) return null
  const last = path.at(-1)
  if (gapM <= 0) {
    const dir = heading(path)
    return dir == null ? last : offset(last, dir, -gapM)
  }
  let left = gapM
  for (let i = path.length - 1; i > 0; i--) {
    const step = distanceMetres(path[i - 1], path[i])
    if (step >= left) {
      const f = step === 0 ? 0 : left / step
      return {
        lat: path[i].lat + (path[i - 1].lat - path[i].lat) * f,
        lng: path[i].lng + (path[i - 1].lng - path[i].lng) * f,
      }
    }
    left -= step
  }
  return path[0]
}
