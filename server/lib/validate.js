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
export const DISTANCES = [100, 200, 400, 800, 1000, 2000, 3000, 5000]

export function normaliseDistance(input) {
  const n = Number(input)
  return DISTANCES.includes(n) ? n : null
}

// Lengths a timed duel can run, in minutes. The wire carries milliseconds.
export const DURATION_MINUTES = [1, 2, 5, 10, 20, 30]

export function normaliseDuration(input) {
  const n = Number(input)
  return Number.isFinite(n) && DURATION_MINUTES.includes(n / 60_000) ? n : null
}

// Quick match runs exactly two fixed formats: a race to a kilometre, or most
// metres in ten minutes. A random opponent agrees to a format, not a
// negotiation, and two pools are the most a small player base keeps liquid.
// The full lists above stay on offer when you challenge someone directly.
