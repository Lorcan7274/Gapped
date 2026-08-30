export const STARTING_RATING = 1000
export const RATING_FLOOR = 100

// Ranked tiers. Ordered low to high; `floor` is inclusive.
// A new player starts at 1000, which is Bronze — the bottom of the ladder.
// "Apex Nemesis" is a title for whoever is rank one, not a tier.
export const TIERS = [
  { key: 'bronze', name: 'Bronze', floor: 0, colour: '#b2724a' },
  { key: 'silver', name: 'Silver', floor: 1100, colour: '#9aa7b4' },
  { key: 'gold', name: 'Gold', floor: 1250, colour: '#c8a233' },
  { key: 'sapphire', name: 'Sapphire', floor: 1400, colour: '#4f46e5' },
  { key: 'amethyst', name: 'Amethyst', floor: 1550, colour: '#8b5cf6' },
  { key: 'diamond', name: 'Diamond', floor: 1700, colour: '#6aa8ff' },
]

export function tierFor(rating) {
  let tier = TIERS[0]
  for (const candidate of TIERS) {
    if (rating >= candidate.floor) tier = candidate
  }
  return tier
}

// Newer players move faster so they reach their real rating sooner: the
// first three duels count double.
export const K_BASE = 32
export const K_PLACEMENT = 64
export const PLACEMENT_DUELS = 3

export function kFactor(gamesPlayed) {
  return gamesPlayed < PLACEMENT_DUELS ? K_PLACEMENT : K_BASE
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

  const kA = kFactor(a.games)
  const kB = kFactor(b.games)

  const nextA = Math.max(RATING_FLOOR, Math.round(a.rating + kA * (scoreA - expectedA)))
  const nextB = Math.max(RATING_FLOOR, Math.round(b.rating + kB * (scoreB - expectedB)))

  return {
    a: { rating: nextA, delta: nextA - a.rating },
    b: { rating: nextB, delta: nextB - b.rating },
  }
}
