import { mean, quantile } from './stats.js'

/**
 * Boil a simulated history down to the numbers that matter for tuning:
 * convergence, calibration, points, inflation, season resets and the
 * exploit checks.
 */
export function summarize({ runners, weeks, duels }, rating) {
  const last = weeks.at(-1)
  const settled = duels.filter((d) => d.effortsDiff != null)

  // How fast a newcomer's rating finds the truth, by in-app results played.
  const newcomerCurve = (filter) => {
    const pool = runners.filter(filter)
    return [0, 1, 2, 3, 5, 8, 12].map((n) => {
      const errors = pool.filter((r) => r.errorByResults.length > n).map((r) => r.errorByResults[n])
      return { n, players: errors.length, meanError: mean(errors), p90Error: quantile(errors, 0.9) }
    })
  }

  const bucket = (items, keyOf, edges) =>
    edges.map(([lo, hi, label]) => ({ label, items: items.filter((d) => keyOf(d) >= lo && keyOf(d) < hi) }))

  const calibrationByGap = bucket(settled, (d) => Math.abs(d.expectedDiff), [
    [0, 50, '0–50'], [50, 100, '50–100'], [100, 200, '100–200'], [200, Infinity, '200+'],
  ]).map(({ label, items }) => {
    const decided = items.filter((d) => d.outcome === 'challenger' || d.outcome === 'target')
    const favWins = decided.filter((d) => (d.outcome === 'challenger') === d.expectedDiff > 0).length
    return {
      label,
      duels: items.length,
      favouriteWinRate: decided.length ? favWins / decided.length : NaN,
      // Duel effort vs duel effort against what the hidden ratings predicted:
      // near zero on average means the expected-gap line is honest.
      meanResidual: mean(items.map((d) => d.effortsDiff - d.expectedDiff)),
      meanAbsResidual: mean(items.map((d) => Math.abs(d.effortsDiff - d.expectedDiff))),
    }
  })

  const calibrationByDistance = bucket(settled, (d) => d.distanceM, [
    [0, 3000, '< 3 km'], [3000, 6000, '3–6 km'], [6000, 10_000, '6–10 km'], [10_000, Infinity, '10 km +'],
  ]).map(({ label, items }) => ({
    label,
    duels: items.length,
    meanResidual: mean(items.map((d) => d.effortsDiff - d.expectedDiff)),
    meanAbsResidual: mean(items.map((d) => Math.abs(d.effortsDiff - d.expectedDiff))),
  }))

  const decided = duels.filter((d) => d.outcome === 'challenger' || d.outcome === 'target')
  const winnerPoints = (d) => (d.outcome === 'challenger' ? d.points.challenger : d.points.target)
  const upset = (d) => (d.outcome === 'challenger') !== d.expectedDiff > 0
  const allPoints = duels.flatMap((d) => [d.points.challenger, d.points.target]).filter((p) => p > 0)
  const walkoverPoints = duels.filter((d) => d.outcome === 'walkover').length * 2

  // Exploit checks, over established runners at the end.
  const established = runners.filter((r) => r.active && r.lifetimeResults >= rating.provisionalResults)
  const bias = (rs) => mean(rs.map((r) => r.rating - r.trueRating))
  const bySlack = [...established].sort((a, b) => a.soloSlack - b.soloSlack)
  const third = Math.floor(bySlack.length / 3)
  const easyRunners = bySlack.slice(-third)
  const hardRunners = bySlack.slice(0, third)
  const perDuel = (rs) => {
    const started = rs.reduce((a, r) => a + r.duelsStarted, 0)
    return started ? rs.reduce((a, r) => a + r.duelPointsStarted, 0) / started : NaN
  }
  const everyone = runners.filter((r) => r.duelsStarted > 0)

  const resets = weeks.filter((w) => w.reset).map((w) => {
    const at = (k) => weeks.find((x) => x.week === w.week + k)?.rmseEstablished
    return { week: w.week, drift: w.drift, before: w.rmseEstablished, after1: at(1), after3: at(3), after6: at(6) }
  })

  return {
    final: {
      week: last.week,
      active: last.active,
      rmseEstablished: last.rmseEstablished,
      rmseAll: last.rmseAll,
      medianAbsError: last.medianAbsError,
      biasAll: last.biasAll,
      spearman: last.spearman,
      poolTrueSpread: last.poolTrueSpread,
    },
    series: weeks,
    newcomers: {
      placed: newcomerCurve((r) => r.placed),
      unplaced: newcomerCurve((r) => !r.placed),
      // Joining a population that has already settled — the steady-state
      // experience, without everyone being provisional at once.
      late: newcomerCurve((r) => r.joinedWeek >= Math.min(12, Math.floor(last.week / 3))),
    },
    calibrationByGap,
    calibrationByDistance,
    points: {
      favouriteWinPoints: mean(decided.filter((d) => !upset(d)).map(winnerPoints)),
      upsetWinPoints: mean(decided.filter(upset).map(winnerPoints)),
      upsetShare: decided.length ? decided.filter(upset).length / decided.length : NaN,
      consolationShare: decided.length
        ? decided.filter((d) => (d.outcome === 'challenger' ? d.points.target : d.points.challenger) > 0).length / decided.length
        : NaN,
      weeklyP50: mean(weeks.map((w) => w.pointsP50)),
      weeklyP90: mean(weeks.map((w) => w.pointsP90)),
      weeklyMax: mean(weeks.map((w) => w.pointsMax)),
      abilityCorrelation: mean(weeks.map((w) => w.pointsAbilityCorr).filter(Number.isFinite)),
      walkoverShare: duels.length ? duels.filter((d) => d.outcome === 'walkover').length / duels.length : NaN,
      pointsPerDuel: mean(allPoints),
      walkoverPointsShare: walkoverPoints / Math.max(1, allPoints.length),
    },
    inflation: {
      biasFirst: weeks[0].biasAll,
      biasLast: last.biasAll,
      ratingDrift: last.meanRating - weeks[0].meanRating,
      trueDrift: last.meanTrue - weeks[0].meanTrue,
    },
    resets,
    exploits: {
      // Runners whose solo runs are easy get challenged on easy ghosts. If
      // that drags their hidden rating down, the gap is the drain.
      easyGhostDrain: bias(easyRunners) - bias(hardRunners),
      easyRunnersBias: bias(easyRunners),
      hardRunnersBias: bias(hardRunners),
      cherryPickEdge: perDuel(everyone.filter((r) => r.cherryPicker)) - perDuel(everyone.filter((r) => !r.cherryPicker)),
      strategicEdge: perDuel(everyone.filter((r) => r.strategic)) - perDuel(everyone.filter((r) => !r.strategic)),
      strategicBias: bias(established.filter((r) => r.strategic)),
      honestBias: bias(established.filter((r) => !r.strategic)),
      strategicQuits: weeks.reduce((a, w) => a + w.strategicQuits, 0),
    },
    totals: {
      duels: duels.length,
      walkovers: weeks.reduce((a, w) => a + w.walkovers, 0),
      withdrawn: weeks.reduce((a, w) => a + w.withdrawn, 0),
      targetQuits: weeks.reduce((a, w) => a + w.targetQuits, 0),
      ties: weeks.reduce((a, w) => a + w.ties, 0),
    },
  }
}

/* ------------------------------------------------------------ formatting */

const fmt = (value, digits = 1) =>
  value == null || Number.isNaN(value) ? '—' : Number(value).toFixed(digits)
const pct = (value) => (value == null || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(1)}%`)
const signed = (value, digits = 1) =>
  value == null || Number.isNaN(value) ? '—' : `${value >= 0 ? '+' : ''}${Number(value).toFixed(digits)}`

export function table(headers, rows) {
  const cells = [headers, ...rows].map((row) => row.map(String))
  const widths = headers.map((_, i) => Math.max(...cells.map((row) => row[i].length)))
  const line = (row) => row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ')
  return [line(cells[0]), widths.map((w) => '─'.repeat(w)).join('  '), ...cells.slice(1).map(line)].join('\n')
}

export function printReport(s, heading) {
  const out = []
  out.push(`\n${heading}\n${'═'.repeat(heading.length)}`)
  out.push(
    `After ${s.final.week} weeks: ${s.final.active} active runners, ${s.totals.duels} duels ` +
    `(${s.totals.walkovers} walkovers, ${s.totals.withdrawn} withdrawn, ${s.totals.targetQuits} quit replies, ${s.totals.ties} ties).`
  )

  out.push('\nCONVERGENCE — hidden rating vs true ability, established runners (5+ results)')
  const series = s.series.filter((w) => w.week === 1 || w.week % 3 === 0 || w.reset || w.week === s.final.week)
  out.push(table(
    ['week', 'active', 'established', 'RMSE', 'median', 'bias', 'rank corr', 'pool spread', 'fav wins'],
    series.map((w) => [
      `${w.week}${w.reset ? ' reset' : ''}`, w.active, w.established, fmt(w.rmseEstablished), fmt(w.medianAbsError),
      signed(w.biasAll), fmt(w.spearman, 3), fmt(w.poolTrueSpread), pct(w.decided ? w.favouriteWins / w.decided : NaN),
    ])
  ))
  out.push('  RMSE/bias in rating points (100 ≈ 7% of race time). Pool spread: sd of true ability within a pool.')

  out.push('\nNEWCOMERS — mean |rating − truth| after n in-app results')
  const nc = (curve) => curve.map((c) => `${fmt(c.meanError, 0)}`)
  out.push(table(
    ['', ...s.newcomers.placed.map((c) => `n=${c.n}`)],
    [
      ['placed (self-report)', ...nc(s.newcomers.placed)],
      ['no placement', ...nc(s.newcomers.unplaced)],
      ['joined a settled population', ...nc(s.newcomers.late)],
    ]
  ))

  out.push('\nCALIBRATION — duel effort vs duel effort, against the expected gap')
  out.push(table(
    ['rating gap', 'duels', 'favourite wins', 'mean residual', 'mean |residual|'],
    s.calibrationByGap.map((b) => [b.label, b.duels, pct(b.favouriteWinRate), signed(b.meanResidual), fmt(b.meanAbsResidual)])
  ))
  out.push(table(
    ['distance', 'duels', 'mean residual', 'mean |residual|'],
    s.calibrationByDistance.map((b) => [b.label, b.duels, signed(b.meanResidual), fmt(b.meanAbsResidual)])
  ))
  out.push('  Residual in rating points; a mean near zero means the expected-gap line is honest.')

  const p = s.points
  out.push('\nPOINTS')
  out.push(table(['', 'value'], [
    ['winner points, favourite wins', fmt(p.favouriteWinPoints)],
    ['winner points, upsets', fmt(p.upsetWinPoints)],
    ['upset share of decided duels', pct(p.upsetShare)],
    ['losers taking consolation points', pct(p.consolationShare)],
    ['walkover share of duels', pct(p.walkoverShare)],
    ['weekly points per runner p50 / p90 / max', `${fmt(p.weeklyP50, 0)} / ${fmt(p.weeklyP90, 0)} / ${fmt(p.weeklyMax, 0)}`],
    ['within-pool corr(points, true ability)', fmt(p.abilityCorrelation, 3)],
  ]))

  const inf = s.inflation
  out.push('\nINFLATION')
  out.push(
    `  bias (rating − truth) week 1 → end: ${signed(inf.biasFirst)} → ${signed(inf.biasLast)}; ` +
    `mean rating moved ${signed(inf.ratingDrift)} while true ability moved ${signed(inf.trueDrift)}.`
  )

  if (s.resets.length) {
    out.push('\nSEASON RESETS — RMSE (established) around each reset')
    out.push(table(['reset week', 'measured drift', 'before', '+1 week', '+3 weeks', '+6 weeks'],
      s.resets.map((r) => [r.week, signed(r.drift), fmt(r.before), fmt(r.after1), fmt(r.after3), fmt(r.after6)])))
  }

  const e = s.exploits
  out.push('\nEXPLOIT CHECKS')
  out.push(table(['', 'value'], [
    ['easy-ghost drain: bias of easy-solo runners − hard-solo runners', signed(e.easyGhostDrain)],
    ['cherry-pick edge: points per duel started, slowest-run pickers − others', signed(e.cherryPickEdge, 2)],
    ['strategic quit edge: points per duel started, quitters − honest', signed(e.strategicEdge, 2)],
    ['strategic quits / withdrawals taken', e.strategicQuits],
    ['hidden-rating bias, strategic vs honest', `${signed(e.strategicBias)} vs ${signed(e.honestBias)}`],
  ]))
  return out.join('\n')
}

/** The handful of numbers a variant is compared on, flat so seeds can be averaged. */
export function keyMetrics(s) {
  const decided = s.calibrationByGap.reduce((a, b) => a + b.duels, 0)
  return {
    rmse: s.final.rmseEstablished,
    bias: s.final.biasAll,
    rankCorr: s.final.spearman,
    newcomer3: s.newcomers.placed.find((c) => c.n === 3)?.meanError,
    newcomer5: s.newcomers.placed.find((c) => c.n === 5)?.meanError,
    late5: s.newcomers.late.find((c) => c.n === 5)?.meanError,
    medianError: s.final.medianAbsError,
    unplaced5: s.newcomers.unplaced.find((c) => c.n === 5)?.meanError,
    favouriteWins: s.calibrationByGap.reduce((a, b) => a + (b.favouriteWinRate || 0) * b.duels, 0) / Math.max(1, decided),
    ghostDrain: s.exploits.easyGhostDrain,
    cherryEdge: s.exploits.cherryPickEdge,
    quitEdge: s.exploits.strategicEdge,
    resetAfter3: mean(s.resets.map((r) => r.after3)),
    upsetPoints: s.points.upsetWinPoints,
    favouritePoints: s.points.favouriteWinPoints,
  }
}

export function averageMetrics(list) {
  const out = {}
  for (const key of Object.keys(list[0])) out[key] = mean(list.map((m) => m[key]).filter(Number.isFinite))
  return out
}

export function printComparison(rows) {
  return table(
    ['variant', 'RMSE', 'median', 'bias', 'rank corr', 'new n=3', 'new n=5', 'late n=5', 'no-place n=5', 'fav win',
      'ghost drain', 'cherry edge', 'quit edge', 'reset +3', 'fav pts', 'upset pts'],
    rows.map(({ name, m }) => [
      name, fmt(m.rmse), fmt(m.medianError), signed(m.bias), fmt(m.rankCorr, 3), fmt(m.newcomer3, 0),
      fmt(m.newcomer5, 0), fmt(m.late5, 0), fmt(m.unplaced5, 0), pct(m.favouriteWins), signed(m.ghostDrain), signed(m.cherryEdge, 2),
      signed(m.quitEdge, 2), fmt(m.resetAfter3), fmt(m.favouritePoints), fmt(m.upsetPoints),
    ])
  )
}
