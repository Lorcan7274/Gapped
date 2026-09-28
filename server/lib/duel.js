import { settleDuel } from './rating.js'
import { RATING, DUEL_POINTS } from '../config/game.js'

/**
 * From a stored duel to the engine's verdict. Pure: the caller hands in the
 * duel row, both players' rows, and whether the duel's Sunday has passed.
 *
 * A duel is decided when it can no longer change:
 *   - the challenger quit leg one           → withdrawn, now
 *   - the reply is in (finished or quit)    → decided, now
 *   - Sunday has passed with a leg missing:
 *       leg one never came in               → the challenger quit it
 *       no reply started                    → walkover
 *       a reply started but never came in   → the target quit it
 *
 * Returns null while the duel is still live.
 */
export function verdictFor(duel, challenger, target, { deadlinePassed }, p = RATING, pts = DUEL_POINTS) {
  const decided =
    (duel.status === 'leg1' && duel.leg1_quit) ||
    (duel.status === 'leg2' && (duel.leg2_ms != null || duel.leg2_quit)) ||
    deadlinePassed
  if (!decided || duel.status === 'settled' || duel.status === 'void') return null

  const leg1 = duel.leg1_ms != null && !duel.leg1_quit ? { timeS: duel.leg1_ms / 1000 } : { quit: true }
  let leg2 = null
  if (duel.status === 'leg2') {
    leg2 = duel.leg2_ms != null && !duel.leg2_quit ? { timeS: duel.leg2_ms / 1000 } : { quit: true }
  }

  return settleDuel(
    {
      distanceM: duel.distance_m,
      ghostTimeS: duel.ghost_ms / 1000,
      challenger: { rating: challenger.mmr, results: challenger.mmr_results, leg: leg1 },
      target: { rating: target.mmr, results: target.mmr_results, leg: leg2 },
    },
    p,
    pts
  )
}
