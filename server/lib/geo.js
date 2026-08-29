const EARTH_RADIUS_M = 6_371_000
const toRad = (deg) => (deg * Math.PI) / 180

// Great-circle distance in metres.
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

// A crude lat/lng box around a point, used to narrow the SQL scan before we
// pay for haversine on each candidate.
export function boundingBox(lat, lng, radiusM) {
  const latDelta = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI)
  const cos = Math.cos(toRad(lat))
  // Near the poles the longitude span degenerates; clamp to the whole range.
  const lngDelta =
    Math.abs(cos) < 1e-6 ? 180 : latDelta / Math.abs(cos)
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  }
}

export function isValidCoord(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}
