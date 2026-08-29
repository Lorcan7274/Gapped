// Display names are shown to other players, so we collapse runs of whitespace
// and cap the length, but otherwise let people call themselves what they like.
// Names are not unique — the player id is the identity.
export function normaliseDisplayName(input) {
  if (typeof input !== 'string') return null
  const collapsed = input.replace(/\s+/g, ' ').trim()
  if (collapsed.length < 2 || collapsed.length > 24) return null
  // Reject control characters, which would let a name break the UI.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(collapsed)) return null
  return collapsed
}

// Coordinates are optional everywhere: a denied permission is not an error.
export function normaliseCoords(lat, lng) {
  // Number(null) and Number('') are both 0, which would silently place a
  // player who denied location at Null Island and make everyone "nearby".
  if (lat == null || lng == null || lat === '' || lng === '') return null
  const parsedLat = Number(lat)
  const parsedLng = Number(lng)
  const usable =
    Number.isFinite(parsedLat) && Number.isFinite(parsedLng) &&
    parsedLat >= -90 && parsedLat <= 90 &&
    parsedLng >= -180 && parsedLng <= 180
  return usable ? { lat: parsedLat, lng: parsedLng } : null
}

// Race distances players can pick, in metres. Metric only — the app has one
// unit system, and the gap it is built around is measured in metres.
export const DISTANCES = [100, 200, 400, 800, 1000, 2000, 3000, 5000]

export function normaliseDistance(input) {
  const n = Number(input)
  return DISTANCES.includes(n) ? n : null
}


