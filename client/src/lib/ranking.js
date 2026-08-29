/**
 * How the challenge list is ordered.
 *
 * The default view wants people who are both nearby AND close in rating, so
 * each is turned into a penalty and the two are added. The reference values
 * below set the exchange rate between them: at these defaults, being 1 km
 * further away costs the same as being 100 rating points apart.
 */
export const REFERENCE_DISTANCE_M = 1000
export const REFERENCE_RATING_GAP = 100

export const SORTS = [
  { key: 'match', label: 'Best match' },
  { key: 'distance', label: 'Closest' },
  { key: 'rating', label: 'Rating gap' },
]

/** Lower is a better match. Null distance means we cannot rank them at all. */
export function matchScore(player) {
  if (player.distanceM == null) return Number.POSITIVE_INFINITY
  const distancePenalty = player.distanceM / REFERENCE_DISTANCE_M
  const ratingPenalty = (player.ratingGap ?? 0) / REFERENCE_RATING_GAP
  return distancePenalty + ratingPenalty
}

/**
 * Sort for the challenge list. A player with no location is never hidden,
 * but always sinks below everyone we can place, in every sort — an unknown
 * distance should not outrank a known one.
 */
export function sortPlayers(players, sort = 'match') {
  const compare = {
    match: (a, b) => matchScore(a) - matchScore(b),
    distance: (a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity),
    rating: (a, b) => (a.ratingGap ?? Infinity) - (b.ratingGap ?? Infinity),
  }[sort] ?? (() => 0)

  return [...players].sort((a, b) => {
    const aPlaced = a.distanceM != null
    const bPlaced = b.distanceM != null
    if (aPlaced !== bPlaced) return aPlaced ? -1 : 1
    const primary = compare(a, b)
    if (primary !== 0 && Number.isFinite(primary)) return primary
    // Stable, meaningful fallback so equal scores do not shuffle between
    // renders as the socket pushes fresh lists.
    return (
      (a.ratingGap ?? 0) - (b.ratingGap ?? 0) ||
      a.displayName.localeCompare(b.displayName)
    )
  })
}

/** Metres below a kilometre, kilometres above. */
export function formatDistance(metres) {
  if (metres == null) return 'No location'
  if (metres < 1000) return `${Math.round(metres)} m`
  if (metres < 10_000) return `${(metres / 1000).toFixed(2)} km`
  return `${(metres / 1000).toFixed(1)} km`
}
