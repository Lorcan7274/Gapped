import { LADDER } from '../config/game.js'

/**
 * The visible ladder: tiers (the crystal a player wears) split into
 * divisions. Division 1 is the top of a tier, so Gold III → Gold II → Gold I
 * climbs; promoting out of a tier's division 1 lands in the next tier's
 * bottom division. Pools and weekly promotion arrive in phase 4.
 */

export const TIERS = LADDER.tiers

export const tierOf = (key) => TIERS.find((t) => t.key === key) ?? TIERS[0]

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** 'Gold II', or just 'Gold' while each tier has a single division. */
export function ladderLabel(tierKey, division, divisions = LADDER.divisionsPerTier) {
  const tier = tierOf(tierKey)
  return divisions > 1 ? `${tier.name} ${ROMAN[division - 1] ?? division}` : tier.name
}

/** Where a player stands, as the client shows it. */
export function ladderPosition(tierKey, division, divisions = LADDER.divisionsPerTier) {
  const tier = tierOf(tierKey)
  const clamped = Math.min(Math.max(1, division || divisions), divisions)
  return {
    key: tier.key,
    name: tier.name,
    colour: tier.colour,
    division: clamped,
    divisions,
    label: ladderLabel(tier.key, clamped, divisions),
  }
}
