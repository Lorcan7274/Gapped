import { RATING, DUEL_POINTS, SEASON } from '../config/game.js'

/**
 * The hidden rating engine: matchmaking machinery that players never see.
 *
 * Pure and deterministic — no I/O, no clock, no randomness. Every function
 * takes its tunables as a last argument defaulting to config/game.js, so the
 * simulation harness can sweep alternatives through the exact code that
 * settles real duels.
 *
 * The model in one paragraph: a rating is a pace (see RATING in
 * config/game.js), so two ratings predict a finishing gap at any distance.
 * A ghost duel is two legs — the challenger races a recording of one of the
 * target's runs, then the target races the challenger's run back — and it
 * is decided on the combined margin. Ratings move on the surprise: how much
 * better one side did, relative to the other, than their ratings predicted.
 * Surprise is measured in rating points and squashed through tanh, so a
 * predictable result barely moves anything, an underdog who loses close
 * gains, and no single freak result moves a rating more than K. The winner
 * of a duel never loses rating for it.
 */

/* -------------------------------------------------------------- validation */

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number (got ${value})`)
  }
  return value
}

function positive(value, name) {
  if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive (got ${value})`)
  return value
}

function distance(distanceM, p) {
  finite(distanceM, 'distanceM')
  if (distanceM < p.minDistanceM || distanceM > p.maxDistanceM) {
    throw new RangeError(
      `distanceM must be between ${p.minDistanceM} and ${p.maxDistanceM} (got ${distanceM})`
    )
  }
  return distanceM
}

function resultsCount(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a whole number of results (got ${value})`)
  }
  return value
}

function player(side, name, p) {
  if (!side || typeof side !== 'object') throw new TypeError(`${name} is required`)
  finite(side.rating, `${name}.rating`)
  // A stored rating outside the bounds means a bug upstream; refuse it
  // rather than let the clamp on the way out disguise it as a rating change.
  if (side.rating < p.minRating || side.rating > p.maxRating) {
    throw new RangeError(
      `${name}.rating must be between ${p.minRating} and ${p.maxRating} (got ${side.rating})`
    )
  }
  resultsCount(side.results, `${name}.results`)
}

/** A leg is { timeS } for a finished run or { quit: true }. */
function leg(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} leg is required`)
  if (value.quit === true) return
  positive(value.timeS, `${name}.leg.timeS`)
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

/* ------------------------------------------------------------ pace curve */

/** Seconds a runner of this rating is expected to take over the distance. */
export function expectedTime(rating, distanceM, p = RATING) {
  finite(rating, 'rating')
  distance(distanceM, p)
  return (
    p.anchorTimeS *
    2 ** ((p.anchorRating - rating) / p.pointsPerDoubling) *
    (distanceM / p.anchorDistanceM) ** p.distanceExponent
  )
}

/** The rating whose expected time over the distance is this time. */
export function ratingForTime(timeS, distanceM, p = RATING) {
  positive(timeS, 'timeS')
  distance(distanceM, p)
  const anchorTime = p.anchorTimeS * (distanceM / p.anchorDistanceM) ** p.distanceExponent
  return p.anchorRating - p.pointsPerDoubling * Math.log2(timeS / anchorTime)
}

/** Seconds by which A is expected to beat B (negative when B is expected ahead). */
export function expectedGap(ratingA, ratingB, distanceM, p = RATING) {
  return expectedTime(ratingB, distanceM, p) - expectedTime(ratingA, distanceM, p)
}

/**
 * The expected gap in metres at the moment the faster runner finishes, both
 * running even splits — the number the in-run screen speaks in. Positive
 * when A is expected ahead.
 */
export function expectedGapMetres(ratingA, ratingB, distanceM, p = RATING) {
  const a = expectedTime(ratingA, distanceM, p)
  const b = expectedTime(ratingB, distanceM, p)
  return a <= b ? distanceM * (1 - a / b) : -distanceM * (1 - b / a)
}

/** How many rating points better A ran than B over the same distance. */
export function performanceDiff(timeA, timeB, p = RATING) {
  positive(timeA, 'timeA')
  positive(timeB, 'timeB')
  return p.pointsPerDoubling * Math.log2(timeB / timeA)
}

/** How many rating points better than their own rating predicts someone ran. */
export function performanceVsRating(rating, timeS, distanceM, p = RATING) {
  return performanceDiff(timeS, expectedTime(rating, distanceM, p), p)
}

/* ----------------------------------------------------------- update speed */

export const isProvisional = (results, p = RATING) =>
  resultsCount(results, 'results') < p.provisionalResults

/** Largest rating move one duel can make, falling from kProvisional to kEstablished. */
export function kFactor(results, p = RATING) {
  resultsCount(results, 'results')
  if (results >= p.provisionalResults) return p.kEstablished
  return p.kProvisional + (p.kEstablished - p.kProvisional) * (results / p.provisionalResults)
}

/** K for `self` against `other`: damped when an established player meets a provisional one. */
function gainFor(self, other, p) {
  const k = kFactor(self.results, p)
  const damp = !isProvisional(self.results, p) && isProvisional(other.results, p)
  return damp ? k * p.provisionalOpponentDamping : k
}

const squash = (surprise, p) => Math.tanh(surprise / p.surpriseScale)

/* ------------------------------------------------------------------ quits */

/**
 * The time a quit leg counts as — "completing it at the expected losing
 * margin". The quitter is scored at their own expected time or the time they
 * were racing, whichever is slower, plus the quit penalty; and they always
 * lose the leg outright, even with the penalty tuned to zero.
 */
export function quitTime(rating, distanceM, racingTimeS, p = RATING) {
  positive(racingTimeS, 'racingTimeS')
  const slower = Math.max(expectedTime(rating, distanceM, p), racingTimeS)
  return Math.max(slower * (1 + p.quitPenalty), racingTimeS + 2 * p.tieSeconds)
}

/* ----------------------------------------------------------------- points */

/**
 * Pool points for a decided duel, from the surprise on the challenger's
 * side. The winner's points scale with how surprising the win was; a loser
 * who beat expectations takes a consolation share.
 */
export function duelPoints(outcome, challengerSurprise, pts = DUEL_POINTS) {
  if (outcome === 'tie') {
    const each = Math.round(pts.base * pts.tieShare)
    return { challenger: each, target: each }
  }
  if (outcome !== 'challenger' && outcome !== 'target') {
    throw new RangeError(`duelPoints needs a decided outcome (got ${outcome})`)
  }
  finite(challengerSurprise, 'challengerSurprise')
  const winnerSurprise = outcome === 'challenger' ? challengerSurprise : -challengerSurprise
  const multiplier = clamp(1 + winnerSurprise / pts.scale, pts.minMultiplier, pts.maxMultiplier)
  const winner = Math.round(pts.base * multiplier)
  const loser = winnerSurprise < 0
    ? Math.round(pts.base * pts.consolationRate * Math.min(1, -winnerSurprise / pts.scale))
    : 0
  return outcome === 'challenger'
    ? { challenger: winner, target: loser }
    : { challenger: loser, target: winner }
}

/* ------------------------------------------------------------- settlement */

function moved(before, delta, p) {
  const after = clamp(before + delta, p.minRating, p.maxRating)
  return { before, delta: after - before, after }
}

/**
 * The visible duel in rating points, from the challenger's side: their run
 * against the geometric mean of the target's two runs (the ghost and the
 * reply) — the log form of the combined margin — less what the two ratings
 * predicted. Points always follow this.
 */
function combinedSurpriseOf(challengerS, ghostS, targetS, expectedDiff, p) {
  return performanceDiff(challengerS, Math.sqrt(ghostS * targetS), p) - expectedDiff
}

/** The surprise ratings move on, per RATING.evidence. */
function ratingSurprise(challengerS, ghostS, targetS, expectedDiff, p) {
  if (p.evidence === 'efforts') return performanceDiff(challengerS, targetS, p) - expectedDiff
  if (p.evidence === 'combined') return combinedSurpriseOf(challengerS, ghostS, targetS, expectedDiff, p)
  throw new RangeError(`RATING.evidence must be 'combined' or 'efforts' (got ${p.evidence})`)
}

/**
 * Settle one ghost duel.
 *
 *   distanceM    the distance raced — the length of the target's recording
 *   ghostTimeS   the target's time on that recording (the leg-1 ghost)
 *   challenger   { rating, results, leg: { timeS } | { quit: true } }
 *   target       { rating, results, leg: { timeS } | { quit: true } | null }
 *                (null: no reply by Sunday)
 *
 * Leg 1 is the challenger against the ghost; leg 2 is the target against the
 * challenger's leg-1 run. Margins are seconds from the challenger's side.
 *
 * Outcomes:
 *   'challenger' | 'target' | 'tie'  both legs in (a quit counts as finished
 *                                    at the expected losing margin)
 *   'walkover'   no reply: the challenger takes a fixed steal, no rating moves
 *   'withdrawn'  the challenger quit their own leg, so nothing was sent to
 *                reply to: the quit costs the challenger rating, nobody
 *                scores points (so a friend cannot feed you points by
 *                starting and abandoning duels against you)
 *
 * `counted` says whose real effort went into the result, for the caller to
 * add to their in-app results (which is what decays K).
 */
export function settleDuel(duel, p = RATING, pts = DUEL_POINTS) {
  if (!duel || typeof duel !== 'object') throw new TypeError('duel is required')
  const { distanceM, ghostTimeS, challenger, target } = duel
  distance(distanceM, p)
  positive(ghostTimeS, 'ghostTimeS')
  player(challenger, 'challenger', p)
  player(target, 'target', p)
  leg(challenger.leg, 'challenger')
  if (target.leg != null) leg(target.leg, 'target')

  const legGapS = expectedGap(challenger.rating, target.rating, distanceM, p)
  const expected = { legGapS, marginS: 2 * legGapS }
  const expectedDiff = challenger.rating - target.rating
  const unmoved = (side) => ({ before: side.rating, delta: 0, after: side.rating })

  if (challenger.leg.quit) {
    // Nothing was sent to reply to. The quit is scored exactly as the duel
    // would be with the challenger finishing at the quit time and the
    // target's reply coming in exactly as expected — so quitting is never
    // better than finishing. Only the challenger moves: the target never ran.
    const challengerS = quitTime(challenger.rating, distanceM, ghostTimeS, p)
    const expectedReplyS = expectedTime(target.rating, distanceM, p)
    const surprise = ratingSurprise(challengerS, ghostTimeS, expectedReplyS, expectedDiff, p)
    return {
      outcome: 'withdrawn',
      marginS: null,
      legs: { leg1S: ghostTimeS - challengerS, leg2S: null },
      expected,
      times: { challengerS, targetS: null, quit: { challenger: true, target: false } },
      surprise: { points: null, rating: surprise },
      rating: {
        // Quitting never gains a rating — not even against a ghost so slow
        // that finishing at the quit time would have.
        challenger: moved(
          challenger.rating,
          Math.min(0, gainFor(challenger, target, p) * squash(surprise, p)),
          p
        ),
        target: unmoved(target),
      },
      points: { challenger: 0, target: 0 },
      counted: { challenger: false, target: false },
    }
  }

  const challengerS = challenger.leg.timeS
  const leg1S = ghostTimeS - challengerS

  if (target.leg == null) {
    return {
      outcome: 'walkover',
      marginS: null,
      legs: { leg1S, leg2S: null },
      expected,
      times: { challengerS, targetS: null, quit: { challenger: false, target: false } },
      surprise: { points: null, rating: null },
      rating: { challenger: unmoved(challenger), target: unmoved(target) },
      points: { challenger: pts.walkoverSteal, target: -pts.walkoverSteal },
      counted: { challenger: false, target: false },
    }
  }

  // A quit reply counts as a reply finished at the expected losing margin,
  // and from here on is treated exactly like one — so finishing at any
  // faster time is never worse than quitting.
  const targetQuit = target.leg.quit === true
  const targetS = targetQuit ? quitTime(target.rating, distanceM, challengerS, p) : target.leg.timeS
  const leg2S = targetS - challengerS
  const marginS = leg1S + leg2S
  const outcome = Math.abs(marginS) <= p.tieSeconds ? 'tie' : marginS > 0 ? 'challenger' : 'target'

  const combinedSurprise = combinedSurpriseOf(challengerS, ghostTimeS, targetS, expectedDiff, p)
  const surprise = ratingSurprise(challengerS, ghostTimeS, targetS, expectedDiff, p)
  let challengerDelta = gainFor(challenger, target, p) * squash(surprise, p)
  let targetDelta = -gainFor(target, challenger, p) * squash(surprise, p)

  // The winner never loses rating for winning, and a quitter never gains any
  // — a quitter who still wins on a big first-leg lead just stays put.
  if (outcome === 'challenger') challengerDelta = Math.max(0, challengerDelta)
  if (outcome === 'target') targetDelta = Math.max(0, targetDelta)
  if (targetQuit) targetDelta = Math.min(0, targetDelta)

  return {
    outcome,
    marginS,
    legs: { leg1S, leg2S },
    expected,
    times: { challengerS, targetS, quit: { challenger: false, target: targetQuit } },
    surprise: { points: combinedSurprise, rating: surprise },
    rating: {
      challenger: moved(challenger.rating, challengerDelta, p),
      target: moved(target.rating, targetDelta, p),
    },
    points: duelPoints(outcome, combinedSurprise, pts),
    counted: { challenger: true, target: !targetQuit },
  }
}

/* ----------------------------------------------------------------- seasons */

/** The middle ratings are squashed toward: the median of the active players. */
export function seasonCentre(ratings) {
  if (!Array.isArray(ratings) || ratings.length === 0) {
    throw new RangeError('seasonCentre needs at least one rating')
  }
  const sorted = ratings.map((r, i) => finite(r, `ratings[${i}]`)).sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The seasonal soft reset: ratings squash toward the centre, and every
 * player briefly moves faster again while the ladder finds its level.
 */
export function seasonReset({ rating, results }, centre, season = SEASON, p = RATING) {
  finite(rating, 'rating')
  finite(centre, 'centre')
  resultsCount(results, 'results')
  return {
    rating: clamp(centre + (rating - centre) * season.squash, p.minRating, p.maxRating),
    results: Math.max(0, Math.min(results, p.provisionalResults - season.provisionalBoost)),
  }
}
