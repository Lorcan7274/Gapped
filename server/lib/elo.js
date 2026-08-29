export const STARTING_RATING = 1000
export const RATING_FLOOR = 100

// Ranked tiers. Ordered low to high; `floor` is inclusive.
// A new player starts at 1000, which is Bronze — the bottom of the ladder.
// "Apex Nemesis" is a title for whoever is rank one, not a tier.
export const TIERS = [
  { key: 'bronze', name: 'Bronze', floor: 0, colour: '#b2724a' },
  { key: 'silver', name: 'Silver', floor: 1100, colour: '#9aa7b4' },
  { key: 'gold', name: 'Gold', floor: 1250, colour: '#e0b23c' },
  { key: 'platinum', name: 'Platinum', floor: 1400, colour: '#5fd6c4' },
  { key: 'diamond', name: 'Diamond', floor: 1550, colour: '#6aa8ff' },
]

export function tierFor(rating) {
  let tier = TIERS[0]
  for (const candidate of TIERS) {
    if (rating >= candidate.floor) tier = candidate
  }
  return tier
}

// Newer players move faster so they reach their real rating sooner.
export function kFactor(gamesPlayed, rating) {
  if (gamesPlayed < 10) return 48
  if (rating >= 1550) return 16
  return 24
}

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

/**
 * Settle one head-to-head result.
 * `scoreA` is 1 if A won, 0 if B won, 0.5 for a draw.
 * Returns the new ratings and the deltas, floored at RATING_FLOOR.
 */
export function settle(a, b, scoreA) {
  const expectedA = expectedScore(a.rating, b.rating)
  const expectedB = 1 - expectedA
  const scoreB = 1 - scoreA

  const kA = kFactor(a.games, a.rating)
  const kB = kFactor(b.games, b.rating)

  const nextA = Math.max(RATING_FLOOR, Math.round(a.rating + kA * (scoreA - expectedA)))
  const nextB = Math.max(RATING_FLOOR, Math.round(b.rating + kB * (scoreB - expectedB)))

  return {
    a: { rating: nextA, delta: nextA - a.rating },
    b: { rating: nextB, delta: nextB - b.rating },
  }
}
