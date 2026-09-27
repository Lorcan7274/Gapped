import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { RATING, DUEL_POINTS, SEASON } from '../config/game.js'
import {
  expectedTime, ratingForTime, expectedGap, expectedGapMetres, performanceDiff,
  performanceVsRating, kFactor, isProvisional, quitTime, duelPoints, settleDuel,
  seasonCentre, seasonReset, paceDrift,
} from './rating.js'

const T = (rating, distanceM = 5000) => expectedTime(rating, distanceM)
const close = (actual, expected, eps = 1e-9, message) =>
  assert.ok(Math.abs(actual - expected) <= eps, message ?? `${actual} ≉ ${expected}`)

/** Seeded PRNG, so every property test is reproducible. */
function prng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A duel from ratings and runs; runs default to exactly as predicted. */
function duel({
  rc = 1000, rt = 1000, d = 5000, g, tc, tt, rsc = 10, rst = 10, quitC = false, quitT = false,
  noReply = false,
} = {}) {
  return {
    distanceM: d,
    ghostTimeS: g ?? expectedTime(rt, d),
    challenger: { rating: rc, results: rsc, leg: quitC ? { quit: true } : { timeS: tc ?? expectedTime(rc, d) } },
    target: {
      rating: rt,
      results: rst,
      leg: noReply ? null : quitT ? { quit: true } : { timeS: tt ?? expectedTime(rt, d) },
    },
  }
}

/** Random but plausible duels, including wild times (GPS glitches, bonks). */
function randomDuels(count, seed, { wild = true } = {}) {
  const rand = prng(seed)
  const pick = (lo, hi) => lo + rand() * (hi - lo)
  const out = []
  for (let i = 0; i < count; i++) {
    const rc = pick(200, 2200)
    const rt = Math.min(RATING.maxRating, Math.max(RATING.minRating, rc + pick(-400, 400)))
    const d = pick(RATING.minDistanceM, 21_100)
    const spread = wild && rand() < 0.1 ? 4 : 0.25
    out.push(duel({
      rc, rt, d,
      g: expectedTime(rt, d) * Math.exp(pick(-spread, spread)),
      tc: expectedTime(rc, d) * Math.exp(pick(-spread, spread)),
      tt: expectedTime(rt, d) * Math.exp(pick(-spread, spread)),
      rsc: Math.floor(pick(0, 12)),
      rst: Math.floor(pick(0, 12)),
    }))
  }
  return out
}

/* ================================================================ pace curve */

describe('pace curve', () => {
  test('the anchor rating runs the anchor distance in the anchor time', () => {
    close(expectedTime(RATING.anchorRating, RATING.anchorDistanceM), RATING.anchorTimeS)
  })

  test('every pointsPerDoubling halves the time; 100 points is about 7% faster', () => {
    close(T(RATING.anchorRating + RATING.pointsPerDoubling), RATING.anchorTimeS / 2)
    close(T(RATING.anchorRating - RATING.pointsPerDoubling), RATING.anchorTimeS * 2)
    close(T(1100) / T(1000), 2 ** -0.1)
    assert.ok(1 - T(1100) / T(1000) > 0.06 && 1 - T(1100) / T(1000) < 0.08)
  })

  test("distance follows Riegel's curve at every rating", () => {
    for (const r of [300, 1000, 1700, 2400]) {
      close(T(r, 10_000) / T(r, 5000), 2 ** RATING.distanceExponent, 1e-12)
      close(T(r, 42_195) / T(r, 1000), 42.195 ** RATING.distanceExponent, 1e-9)
    }
  })

  test('higher ratings are faster, longer distances slower, everywhere', () => {
    const ratings = [0, 250, 800, 1000, 1400, 2000, 3000]
    const distances = [400, 1000, 5000, 10_000, 21_097, 50_000]
    for (const d of distances) {
      for (let i = 1; i < ratings.length; i++) assert.ok(T(ratings[i], d) < T(ratings[i - 1], d))
    }
    for (const r of ratings) {
      for (let i = 1; i < distances.length; i++) assert.ok(T(r, distances[i]) > T(r, distances[i - 1]))
    }
  })

  test('ratingForTime inverts expectedTime', () => {
    for (const r of [0, 437.5, 1000, 1633, 3000]) {
      for (const d of [400, 3000, 5000, 15_000, 50_000]) {
        close(ratingForTime(expectedTime(r, d), d), r, 1e-9)
      }
    }
  })

  test('the expected gap is antisymmetric, zero between equals, and positive for the faster', () => {
    close(expectedGap(1200, 1200, 5000), 0)
    close(expectedGap(1200, 1000, 8000), -expectedGap(1000, 1200, 8000))
    assert.ok(expectedGap(1200, 1000, 5000) > 0)
    close(expectedGap(1100, 1000, 5000), T(1000) - T(1100))
  })

  test('the expected gap is the same fraction of the race at every distance', () => {
    const fraction = (d) => expectedGap(1300, 1000, d) / expectedTime(1000, d)
    for (const d of [400, 1000, 5000, 21_097, 50_000]) close(fraction(d), fraction(5000), 1e-12)
  })

  test('the expected gap in metres is antisymmetric and within the race', () => {
    close(expectedGapMetres(1000, 1000, 5000), 0)
    close(expectedGapMetres(1100, 1000, 5000), -expectedGapMetres(1000, 1100, 5000))
    close(expectedGapMetres(1100, 1000, 5000), 5000 * (1 - 2 ** -0.1))
    assert.ok(expectedGapMetres(3000, 0, 50_000) < 50_000)
    assert.ok(expectedGapMetres(0, 3000, 50_000) > -50_000)
  })

  test('performance differences agree with the curve', () => {
    close(performanceDiff(900, 1800), RATING.pointsPerDoubling)
    close(performanceDiff(1500, 1500), 0)
    close(performanceDiff(1400, 1600), -performanceDiff(1600, 1400))
    const d = 7300
    close(performanceDiff(2000, 2300), ratingForTime(2000, d) - ratingForTime(2300, d), 1e-9)
    close(performanceVsRating(1234, expectedTime(1234, d), d), 0, 1e-9)
    assert.ok(performanceVsRating(1234, expectedTime(1234, d) * 0.95, d) > 0)
  })

  test('nonsense is refused, never silently computed', () => {
    for (const bad of [399, 50_001, NaN, Infinity, -5000, '5000', null, undefined]) {
      assert.throws(() => expectedTime(1000, bad), /distanceM/, String(bad))
    }
    for (const bad of [NaN, Infinity, '1000', null]) {
      assert.throws(() => expectedTime(bad, 5000), /rating/, String(bad))
    }
    for (const bad of [0, -1, NaN, Infinity]) {
      assert.throws(() => ratingForTime(bad, 5000), /timeS/, String(bad))
      assert.throws(() => performanceDiff(bad, 100), /timeA/, String(bad))
    }
  })
})

/* ============================================================== update speed */

describe('update speed', () => {
  test('K starts at kProvisional and falls to kEstablished over the provisional results', () => {
    assert.equal(kFactor(0), RATING.kProvisional)
    assert.equal(kFactor(RATING.provisionalResults), RATING.kEstablished)
    assert.equal(kFactor(500), RATING.kEstablished)
    for (let n = 1; n <= 12; n++) assert.ok(kFactor(n) <= kFactor(n - 1))
    close(kFactor(1), RATING.kProvisional + (RATING.kEstablished - RATING.kProvisional) / RATING.provisionalResults)
  })

  test('a player is provisional until they have enough in-app results', () => {
    assert.equal(isProvisional(RATING.provisionalResults - 1), true)
    assert.equal(isProvisional(RATING.provisionalResults), false)
  })

  test('results must be a whole, non-negative count', () => {
    for (const bad of [-1, 1.5, NaN, '3', null]) {
      assert.throws(() => kFactor(bad), /results/, String(bad))
    }
  })

  test('provisional players move faster; established players facing them move slower', () => {
    const s = { rc: 1000, rt: 1000, tc: T(1000) * 0.97 }
    const newcomer = settleDuel(duel({ ...s, rsc: 0 })).rating.challenger.delta
    const veteran = settleDuel(duel({ ...s, rsc: 20 })).rating.challenger.delta
    assert.ok(newcomer > veteran * 3)
    const vsNewcomer = settleDuel(duel({ ...s, rsc: 20, rst: 0 })).rating.challenger.delta
    close(vsNewcomer, veteran * RATING.provisionalOpponentDamping, 1e-9)
  })
})

/* ========================================================== settling a duel */

describe('settling a duel', () => {
  test('a result exactly as predicted moves nothing and pays the base', () => {
    const r = settleDuel(duel({ rc: 1100, rt: 1000 }))
    assert.equal(r.outcome, 'challenger')
    close(r.rating.challenger.delta, 0)
    close(r.rating.target.delta, 0)
    close(r.marginS, r.expected.marginS, 1e-9)
    assert.deepEqual(r.points, { challenger: DUEL_POINTS.base, target: 0 })
    assert.deepEqual(r.counted, { challenger: true, target: true })
  })

  test('an underdog who loses close gains, and the winning favourite is floored at zero', () => {
    // 3% better than their own rating says, still well short of the favourite.
    const r = settleDuel(duel({ rc: 900, rt: 1000, tc: T(900) * 0.97 }))
    assert.equal(r.outcome, 'target')
    assert.ok(r.rating.challenger.delta > 0)
    assert.equal(r.rating.target.delta, 0)
    assert.ok(r.points.target < DUEL_POINTS.base)
    assert.ok(r.points.challenger > 0)
  })

  test('an upset pays more than the base and moves both ratings', () => {
    const r = settleDuel(duel({ rc: 900, rt: 1000, tc: T(1000) * 0.99 }))
    assert.equal(r.outcome, 'challenger')
    assert.ok(r.points.challenger > DUEL_POINTS.base)
    assert.equal(r.points.target, 0)
    assert.ok(r.rating.challenger.delta > 0)
    assert.ok(r.rating.target.delta < 0)
  })

  test('a favourite who wins by more than predicted gains, and the loser drops', () => {
    const r = settleDuel(duel({ rc: 1100, rt: 1000, tc: T(1100) * 0.97 }))
    assert.equal(r.outcome, 'challenger')
    assert.ok(r.rating.challenger.delta > 0)
    assert.ok(r.rating.target.delta < 0)
  })

  test('a result closer to the prediction moves ratings less', () => {
    const move = (f) => Math.abs(settleDuel(duel({ rc: 1100, rt: 1000, tc: T(1100) * f })).rating.target.delta)
    assert.ok(move(0.999) < move(0.99))
    assert.ok(move(0.99) < move(0.95))
  })

  test('ties split the points and do not floor anyone', () => {
    // Equal ratings, challenger half a second quicker than the ghost, target
    // half a second slower on the reply: a combined margin of one second.
    const t = T(1000)
    const r = settleDuel(duel({ rc: 1000, rt: 1000, g: t, tc: t - 0.5, tt: t }))
    assert.equal(r.outcome, 'tie')
    const each = Math.round(DUEL_POINTS.base * DUEL_POINTS.tieShare)
    assert.deepEqual(r.points, { challenger: each, target: each })
    close(r.rating.challenger.delta, -r.rating.target.delta, 1e-12)
  })

  test('ratings never leave their bounds', () => {
    const top = settleDuel(duel({ rc: RATING.maxRating - 1, rt: RATING.maxRating - 400, tc: T(RATING.maxRating) * 0.5, rsc: 0 }))
    assert.equal(top.rating.challenger.after, RATING.maxRating)
    const bottom = settleDuel(duel({ rc: RATING.minRating + 1, rt: 500, tc: T(0) * 3, rsc: 0 }))
    assert.ok(bottom.rating.challenger.after >= RATING.minRating)
  })

  test('the same duel always settles the same way, and inputs are left alone', () => {
    const input = Object.freeze({
      ...duel({ rc: 1234, rt: 1111, d: 8000, tc: 2300, tt: 2500, g: 2450 }),
    })
    Object.freeze(input.challenger); Object.freeze(input.target)
    assert.deepEqual(settleDuel(input), settleDuel(input))
  })
})

/* ================================================================ invariants */

describe('invariants over thousands of random duels', () => {
  const duels = randomDuels(4000, 7)

  test('no result moves a rating by more than K, and nothing is ever NaN', () => {
    for (const d of duels) {
      const r = settleDuel(d)
      for (const side of ['challenger', 'target']) {
        const { delta, after } = r.rating[side]
        assert.ok(Number.isFinite(delta) && Number.isFinite(after))
        assert.ok(Math.abs(delta) <= kFactor(d[side].results) + 1e-9)
      }
      assert.ok(Number.isInteger(r.points.challenger) && Number.isInteger(r.points.target))
    }
  })

  test('the winner never loses rating', () => {
    for (const d of duels) {
      const r = settleDuel(d)
      if (r.outcome === 'challenger') assert.ok(r.rating.challenger.delta >= 0)
      if (r.outcome === 'target') assert.ok(r.rating.target.delta >= 0)
    }
  })

  test('with equal speeds and no floor in play, what one side gains the other loses', () => {
    for (const d of duels) {
      const same = { ...d, challenger: { ...d.challenger, results: 10 }, target: { ...d.target, results: 10 } }
      const r = settleDuel(same)
      const floored =
        (r.outcome === 'challenger' && r.rating.challenger.delta === 0) ||
        (r.outcome === 'target' && r.rating.target.delta === 0)
      const clamped = [r.rating.challenger.after, r.rating.target.after]
        .some((v) => v === RATING.minRating || v === RATING.maxRating)
      if (!floored && !clamped) close(r.rating.challenger.delta, -r.rating.target.delta, 1e-9)
    }
  })

  test('the winner always scores at least as much as the loser', () => {
    for (const d of duels) {
      const r = settleDuel(d)
      if (r.outcome === 'challenger') assert.ok(r.points.challenger >= r.points.target)
      if (r.outcome === 'target') assert.ok(r.points.target >= r.points.challenger)
      assert.ok(r.points.challenger >= 0 && r.points.target >= 0)
    }
  })

  test('running faster never earns you less, in rating or in points', () => {
    for (const d of randomDuels(300, 11, { wild: false })) {
      let last = null
      for (const f of [1.3, 1.15, 1.05, 1.0, 0.97, 0.93, 0.85]) {
        const run = { ...d, challenger: { ...d.challenger, leg: { timeS: expectedTime(d.challenger.rating, d.distanceM) * f } } }
        const r = settleDuel(run)
        if (last) {
          assert.ok(r.rating.challenger.delta >= last.rating.challenger.delta - 1e-9)
          assert.ok(r.points.challenger >= last.points.challenger)
        }
        last = r
      }
      last = null
      for (const f of [1.3, 1.15, 1.05, 1.0, 0.97, 0.93, 0.85]) {
        const run = { ...d, target: { ...d.target, leg: { timeS: expectedTime(d.target.rating, d.distanceM) * f } } }
        const r = settleDuel(run)
        if (last) {
          assert.ok(r.rating.target.delta >= last.rating.target.delta - 1e-9)
          assert.ok(r.points.target >= last.points.target)
        }
        last = r
      }
    }
  })
})

/* ================================================ quits, walkovers, withdrawals */

describe('quits, walkovers and withdrawals', () => {
  test('no reply by Sunday is a walkover: a fixed steal, no rating moves', () => {
    const r = settleDuel(duel({ rc: 1000, rt: 1300, noReply: true }))
    assert.equal(r.outcome, 'walkover')
    assert.deepEqual(r.points, { challenger: DUEL_POINTS.walkoverSteal, target: -DUEL_POINTS.walkoverSteal })
    assert.equal(r.rating.challenger.delta, 0)
    assert.equal(r.rating.target.delta, 0)
    assert.deepEqual(r.counted, { challenger: false, target: false })
  })

  test('a quit reply is scored exactly like finishing at the quit time — except it never gains', () => {
    for (const d of randomDuels(1500, 21)) {
      const quit = settleDuel({ ...d, target: { ...d.target, leg: { quit: true } } })
      const asIf = settleDuel({ ...d, target: { ...d.target, leg: { timeS: quit.times.targetS } } })
      assert.equal(quit.outcome, asIf.outcome)
      assert.deepEqual(quit.points, asIf.points)
      close(quit.rating.challenger.delta, asIf.rating.challenger.delta, 1e-9)
      close(quit.rating.target.delta, Math.min(0, asIf.rating.target.delta), 1e-9)
      assert.deepEqual(quit.counted, { challenger: true, target: false })
      assert.equal(quit.times.quit.target, true)
    }
  })

  test('finishing at any time up to the quit time is never worse than quitting', () => {
    for (const d of randomDuels(1500, 22)) {
      const quit = settleDuel({ ...d, target: { ...d.target, leg: { quit: true } } })
      for (const f of [1, 0.99, 0.95, 0.8]) {
        const finished = settleDuel({ ...d, target: { ...d.target, leg: { timeS: quit.times.targetS * f } } })
        assert.ok(finished.rating.target.delta >= quit.rating.target.delta - 1e-9)
        assert.ok(finished.points.target >= quit.points.target)
      }
    }
  })

  test('a quitter always loses the leg they quit, even with no penalty at all', () => {
    const lenient = { ...RATING, quitPenalty: 0 }
    for (const racing of [600, 1800, 5000]) {
      for (const r of [300, 1000, 2500]) {
        assert.ok(quitTime(r, 5000, racing, lenient) > racing + RATING.tieSeconds)
        assert.ok(quitTime(r, 5000, racing) >= Math.max(T(r), racing) * (1 + RATING.quitPenalty) - 1e-9)
      }
    }
  })

  test('a big enough first-leg lead survives a quit reply, without the quitter gaining', () => {
    // The target's ghost was superb; the challenger ran slowly; the target quits.
    const r = settleDuel(duel({ rc: 1000, rt: 1000, g: T(1000) * 0.8, tc: T(1000) * 1.1, quitT: true }))
    assert.equal(r.outcome, 'target')
    assert.equal(r.rating.target.delta, 0)
    assert.ok(r.points.target > 0)
  })

  test('a challenger who quits withdraws the challenge: only they can lose anything', () => {
    for (const d of randomDuels(1500, 23)) {
      const r = settleDuel({ ...d, challenger: { ...d.challenger, leg: { quit: true } } })
      assert.equal(r.outcome, 'withdrawn')
      assert.ok(r.rating.challenger.delta <= 0)
      assert.equal(r.rating.target.delta, 0)
      assert.deepEqual(r.points, { challenger: 0, target: 0 })
      assert.deepEqual(r.counted, { challenger: false, target: false })
    }
  })

  test('withdrawing costs what finishing at the quit time against an expected reply would', () => {
    for (const d of randomDuels(1000, 24)) {
      const quit = settleDuel({ ...d, challenger: { ...d.challenger, leg: { quit: true } } })
      const asIf = settleDuel({
        ...d,
        challenger: { ...d.challenger, leg: { timeS: quit.times.challengerS } },
        target: { ...d.target, leg: { timeS: expectedTime(d.target.rating, d.distanceM) } },
      })
      // Without the winner floor or the never-gain cap in play, they match.
      const raw = asIf.rating.challenger.delta
      if (asIf.outcome !== 'challenger' && raw <= 0) close(quit.rating.challenger.delta, raw, 1e-9)
      assert.ok(quit.rating.challenger.delta <= Math.max(0, raw) + 1e-9)
    }
  })
})

/* ============================================================ evidence modes */

describe('evidence modes', () => {
  const efforts = { ...RATING, evidence: 'efforts' }

  test('an easy ghost run drains the target in combined mode but not in efforts mode', () => {
    // Both duel efforts exactly as predicted; the ghost was a jog 15% off pace.
    const d = duel({ rc: 1000, rt: 1000, g: T(1000) * 1.15 })
    const combined = settleDuel(d)
    const fair = settleDuel(d, efforts)
    assert.equal(combined.outcome, 'challenger')
    assert.ok(combined.rating.target.delta < -5)
    close(fair.rating.target.delta, 0, 1e-9)
    close(fair.rating.challenger.delta, 0, 1e-9)
  })

  test('points follow the visible combined margin in both modes', () => {
    for (const d of randomDuels(500, 31)) {
      assert.deepEqual(settleDuel(d).points, settleDuel(d, efforts).points)
      assert.equal(settleDuel(d).outcome, settleDuel(d, efforts).outcome)
    }
  })

  test('an unknown evidence mode is refused', () => {
    assert.throws(() => settleDuel(duel(), { ...RATING, evidence: 'vibes' }), /evidence/)
  })
})

/* ==================================================================== points */

describe('duel points', () => {
  test('the winner earns more the more surprising the win, within the multiplier bounds', () => {
    let last = -Infinity
    for (const s of [-400, -150, -50, 0, 50, 150, 400]) {
      const p = duelPoints('challenger', s).challenger
      assert.ok(p >= last)
      last = p
    }
    assert.equal(duelPoints('challenger', 0).challenger, DUEL_POINTS.base)
    assert.equal(duelPoints('challenger', -10_000).challenger, Math.round(DUEL_POINTS.base * DUEL_POINTS.minMultiplier))
    assert.equal(duelPoints('challenger', 10_000).challenger, Math.round(DUEL_POINTS.base * DUEL_POINTS.maxMultiplier))
  })

  test('a loser scores only when they beat expectations, capped at the consolation share', () => {
    // The target won; a positive challenger surprise means the challenger
    // lost by less than their ratings predicted.
    assert.equal(duelPoints('target', 60).challenger, Math.round(DUEL_POINTS.base * DUEL_POINTS.consolationRate * 60 / DUEL_POINTS.scale))
    assert.equal(duelPoints('target', -60).challenger, 0)
    assert.equal(duelPoints('target', 10_000).challenger, Math.round(DUEL_POINTS.base * DUEL_POINTS.consolationRate))
  })

  test('points are mirrored by side', () => {
    assert.deepEqual(duelPoints('challenger', 80), {
      challenger: duelPoints('target', -80).target,
      target: duelPoints('target', -80).challenger,
    })
  })

  test('only decided outcomes score here', () => {
    assert.throws(() => duelPoints('walkover', 0), /decided outcome/)
    assert.throws(() => duelPoints('challenger', NaN), /challengerSurprise/)
  })
})

/* =================================================================== seasons */

describe('seasons', () => {
  test('the centre is the median', () => {
    assert.equal(seasonCentre([1300, 900, 1000]), 1000)
    assert.equal(seasonCentre([900, 1000, 1100, 1400]), 1050)
    assert.throws(() => seasonCentre([]), /at least one/)
    assert.throws(() => seasonCentre([1000, NaN]), /ratings\[1\]/)
  })

  test('a reset squashes toward the centre and briefly speeds everyone up', () => {
    const high = seasonReset({ rating: 1500, results: 40 }, { centre: 1000 })
    close(high.rating, 1000 + 500 * SEASON.squash)
    assert.equal(high.results, RATING.provisionalResults - SEASON.provisionalBoost)
    assert.ok(kFactor(high.results) > RATING.kEstablished)
    const low = seasonReset({ rating: 600, results: 1 }, { centre: 1000 })
    close(low.rating, 1000 - 400 * SEASON.squash)
    assert.equal(low.results, 1)
    const centre = seasonReset({ rating: 1000, results: 9 }, { centre: 1000 })
    assert.equal(centre.rating, 1000)
  })

  test('a reset never produces negative results or ratings out of bounds', () => {
    const r = seasonReset({ rating: 2900, results: 3 }, { centre: 2000 }, { ...SEASON, squash: 1.2, provisionalBoost: 9 })
    assert.equal(r.results, 0)
    assert.equal(r.rating, RATING.maxRating)
  })

  test('re-anchoring shifts the whole scale by the measured drift, only when switched on', () => {
    const on = { ...SEASON, squash: 1, reanchor: true }
    close(seasonReset({ rating: 1234, results: 9 }, { centre: 1000, drift: -40 }, on).rating, 1194)
    close(seasonReset({ rating: 1234, results: 9 }, { centre: 1000, drift: -40 }, { ...on, reanchor: false }).rating, 1234)
  })

  test('pace drift is the median of how much faster runners ran than their ratings said', () => {
    const season = { ...SEASON, reanchorMinEfforts: 3, reanchorMaxShift: 100 }
    // Three runners, each 50 rating points slower than rated: inflation.
    const efforts = [900, 1200, 1500].map((rating) => ({
      rating, distanceM: 5000, timeS: expectedTime(rating - 50, 5000),
    }))
    close(paceDrift(efforts, season), -50, 1e-9)
    // One wild outlier does not move a median.
    efforts.push({ rating: 1000, distanceM: 5000, timeS: expectedTime(1000, 5000) / 3 })
    close(paceDrift([...efforts, efforts[0]], season), -50, 1e-9)
  })

  test('pace drift says nothing from too few efforts, and never shifts past the cap', () => {
    const season = { ...SEASON, reanchorMinEfforts: 5, reanchorMaxShift: 30 }
    const slow = Array.from({ length: 4 }, () => ({ rating: 1000, distanceM: 5000, timeS: T(700) }))
    assert.equal(paceDrift(slow, season), 0)
    assert.equal(paceDrift([...slow, slow[0]], season), -30)
    assert.throws(() => paceDrift(null), /array/)
  })
})

/* ======================================================== input validation */

describe('settleDuel refuses malformed duels', () => {
  const base = duel()
  const cases = {
    'no duel': undefined,
    'distance too short': { ...base, distanceM: 100 },
    'no ghost time': { ...base, ghostTimeS: 0 },
    'no challenger': { ...base, challenger: undefined },
    'challenger rating NaN': { ...base, challenger: { ...base.challenger, rating: NaN } },
    'target rating below the floor': { ...base, target: { ...base.target, rating: RATING.minRating - 1 } },
    'challenger rating above the ceiling': { ...base, challenger: { ...base.challenger, rating: RATING.maxRating + 1 } },
    'fractional results': { ...base, target: { ...base.target, results: 2.5 } },
    'no challenger leg': { ...base, challenger: { ...base.challenger, leg: null } },
    'negative reply time': { ...base, target: { ...base.target, leg: { timeS: -3 } } },
    'reply with neither time nor quit': { ...base, target: { ...base.target, leg: {} } },
  }
  for (const [name, input] of Object.entries(cases)) {
    test(name, () => assert.throws(() => settleDuel(input)))
  }
})
