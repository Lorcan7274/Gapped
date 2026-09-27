import { RATING, DUEL_POINTS, SEASON } from '../config/game.js'
import {
  settleDuel, expectedTime, performanceDiff, seasonCentre, seasonReset, paceDrift,
} from '../lib/rating.js'
import { createRng } from './rng.js'
import { WORLD, createRunner, runTime, evolve } from './world.js'
import { mean, sd, rmse, quantile, pearson, spearman } from './stats.js'

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

/**
 * One simulated history of the game: a population of synthetic runners
 * with known true abilities, playing weekly pools of ghost duels settled by
 * the real engine (lib/rating.js). Because the truth is known, the output
 * says how well hidden ratings track it, how fair the points are, and
 * whether any behaviour pays that should not.
 *
 * Deterministic for a given seed and configuration.
 */
export function simulate({
  seed = 1,
  world = WORLD,
  rating = RATING,
  points = DUEL_POINTS,
  season = SEASON,
} = {}) {
  const rng = createRng(seed)
  const runners = []
  let nextId = 1
  const add = (week) => runners.push(createRunner(rng, world, rating, week, nextId++))
  for (let i = 0; i < world.players; i++) add(0)

  const weeks = []
  const duels = []
  // This season's real duel efforts, for measuring pace drift at the reset.
  let seasonEfforts = []

  for (let week = 1; week <= world.weeks; week++) {
    for (const r of runners) if (r.active && rng.chance(world.leaveRate)) r.active = false
    const joiners = rng.poisson(world.players * world.joinRate)
    for (let i = 0; i < joiners; i++) add(week)
    const active = runners.filter((r) => r.active)
    for (const r of active) evolve(rng, world, rating, r, week)

    // Monday: pools of similar hidden rating. A short last pool joins the one
    // above it rather than play a lonely week.
    const sorted = [...active].sort((a, b) => b.rating - a.rating || a.id - b.id)
    const pools = []
    for (let i = 0; i < sorted.length; i += world.poolSize) pools.push(sorted.slice(i, i + world.poolSize))
    if (pools.length > 1 && pools.at(-1).length < world.poolSize / 2) pools.at(-2).push(...pools.pop())

    const weekPoints = new Map(active.map((r) => [r.id, 0]))
    const tally = {
      duels: 0, walkovers: 0, withdrawn: 0, targetQuits: 0, ties: 0, strategicQuits: 0,
      decided: 0, favouriteWins: 0,
    }

    for (const pool of pools) {
      const feed = soloRuns(rng, world, rating, pool)
      const starts = []
      for (const r of pool) {
        const n = Math.min(world.duelCapPerWeek, rng.poisson(r.duelRate))
        for (let i = 0; i < n; i++) starts.push(r)
      }
      rng.shuffle(starts)

      for (const challenger of starts) {
        const targets = pool.filter((t) => t !== challenger && feed.get(t.id).length > 0)
        if (targets.length === 0) continue
        const target = rng.pick(targets)
        const runs = feed.get(target.id)
        const ghost = challenger.cherryPicker ? slowest(runs, rating) : rng.pick(runs)

        const played = playDuel(rng, world, rating, points, challenger, target, ghost)
        const { result } = played
        const effort = (side, timeS) =>
          seasonEfforts.push({ rating: result.rating[side].before, timeS, distanceM: ghost.distanceM })
        if (result.outcome !== 'withdrawn') effort('challenger', result.times.challengerS)
        if (result.times.targetS != null && !result.times.quit.target) effort('target', result.times.targetS)
        apply(challenger, result.rating.challenger.after, result.counted.challenger)
        apply(target, result.rating.target.after, result.counted.target)
        weekPoints.set(challenger.id, weekPoints.get(challenger.id) + result.points.challenger)
        weekPoints.set(target.id, weekPoints.get(target.id) + result.points.target)
        challenger.duelsStarted += 1
        challenger.duelPointsStarted += result.points.challenger

        tally.duels += 1
        if (result.outcome === 'walkover') tally.walkovers += 1
        if (result.outcome === 'withdrawn') tally.withdrawn += 1
        if (result.outcome === 'tie') tally.ties += 1
        if (result.times.quit.target) tally.targetQuits += 1
        if (played.strategicQuit) tally.strategicQuits += 1
        const expectedDiff = result.rating.challenger.before - result.rating.target.before
        if ((result.outcome === 'challenger' || result.outcome === 'target') && expectedDiff !== 0) {
          tally.decided += 1
          if ((result.outcome === 'challenger') === expectedDiff > 0) tally.favouriteWins += 1
        }
        duels.push({
          week,
          distanceM: ghost.distanceM,
          ghostSlack: ghost.slack,
          expectedDiff,
          trueDiff: challenger.trueRating - target.trueRating,
          outcome: result.outcome,
          // Duel effort against duel effort, when both are real runs.
          effortsDiff: result.outcome !== 'walkover' && result.outcome !== 'withdrawn' && !result.times.quit.target
            ? performanceDiff(result.times.challengerS, result.times.targetS, rating)
            : null,
          surprise: result.surprise.points,
          points: result.points,
          delta: { challenger: result.rating.challenger.delta, target: result.rating.target.delta },
          cherryPicked: challenger.cherryPicker,
          strategicQuit: played.strategicQuit,
        })
      }
    }

    for (const r of active) r.points += weekPoints.get(r.id)

    let reset = false
    let drift = null
    if (week % season.lengthWeeks === 0 && week < world.weeks) {
      const centre = seasonCentre(active.map((r) => r.rating))
      drift = paceDrift(seasonEfforts, season, rating)
      for (const r of active) Object.assign(r, seasonReset(r, { centre, drift }, season, rating))
      seasonEfforts = []
      reset = true
    }

    weeks.push({ ...snapshot(week, rating, active, pools, weekPoints, tally, reset), drift })
  }

  return { runners, weeks, duels }
}

/** The week's feed: every runner's solo runs, mostly easy, some hard. */
function soloRuns(rng, world, rating, pool) {
  const feed = new Map()
  for (const r of pool) {
    const count = Math.max(0, Math.round(rng.normal(r.runsPerWeek, 0.7)))
    const runs = []
    for (let i = 0; i < count; i++) {
      const distanceM = clamp(Math.round(rng.logNormal(r.distancePref, world.runDistanceSpread)), 1000, 21_097)
      const slack = rng.chance(world.hardSoloShare)
        ? rng.uniform(0, 0.02)
        : Math.max(0, rng.normal(r.soloSlack, 0.04))
      runs.push({ distanceM, slack, timeS: runTime(rng, world, rating, r, distanceM, slack) })
    }
    feed.set(r.id, runs)
  }
  return feed
}

/** A cherry-picker takes the slowest run by pace, allowing for distance. */
function slowest(runs, rating) {
  const pace = (run) => run.timeS / (run.distanceM ** rating.distanceExponent)
  return runs.reduce((a, b) => (pace(b) > pace(a) ? b : a))
}

/** Leg 1, then a reply or silence; quits random or strategic. */
function playDuel(rng, world, rating, points, challenger, target, ghost) {
  const settle = (challengerLeg, targetLeg) => settleDuel({
    distanceM: ghost.distanceM,
    ghostTimeS: ghost.timeS,
    challenger: { rating: challenger.rating, results: challenger.results, leg: challengerLeg },
    target: { rating: target.rating, results: target.results, leg: targetLeg },
  }, rating, points)

  // A strategic player takes whichever scores more points, then rating.
  const better = (a, b, side) =>
    a.points[side] > b.points[side] ||
    (a.points[side] === b.points[side] && a.rating[side].delta > b.rating[side].delta + 1e-9)

  let strategicQuit = false
  let challengerLeg = { timeS: runTime(rng, world, rating, challenger, ghost.distanceM, 0) }
  if (rng.chance(world.randomQuitRate)) {
    challengerLeg = { quit: true }
  } else if (challenger.strategic) {
    // The reply has not happened yet; judge against the expected one.
    const expectedReply = { timeS: expectedTime(target.rating, ghost.distanceM, rating) }
    if (better(settle({ quit: true }, expectedReply), settle(challengerLeg, expectedReply), 'challenger')) {
      challengerLeg = { quit: true }
      strategicQuit = true
    }
  }
  if (challengerLeg.quit) {
    challenger.quits += 1
    return { result: settle(challengerLeg, null), strategicQuit }
  }

  if (!rng.chance(target.replyProb)) return { result: settle(challengerLeg, null), strategicQuit }

  let targetLeg = { timeS: runTime(rng, world, rating, target, ghost.distanceM, 0) }
  if (rng.chance(world.randomQuitRate)) {
    targetLeg = { quit: true }
  } else if (target.strategic) {
    if (better(settle(challengerLeg, { quit: true }), settle(challengerLeg, targetLeg), 'target')) {
      targetLeg = { quit: true }
      strategicQuit = true
    }
  }
  if (targetLeg.quit) target.quits += 1
  return { result: settle(challengerLeg, targetLeg), strategicQuit }
}

function apply(runner, rating, counted) {
  runner.rating = rating
  if (!counted) return
  runner.results += 1
  runner.lifetimeResults += 1
  runner.errorByResults.push(Math.abs(runner.rating - runner.trueRating))
}

function snapshot(week, rating, active, pools, weekPoints, tally, reset) {
  const established = active.filter((r) => r.lifetimeResults >= rating.provisionalResults)
  const errors = (rs) => rs.map((r) => r.rating - r.trueRating)
  const weekly = active.map((r) => weekPoints.get(r.id))
  // Within a pool, do points just follow raw ability? (Low is fair.)
  const poolCorr = pools
    .map((pool) => pearson(pool.map((r) => weekPoints.get(r.id)), pool.map((r) => r.trueRating)))
    .filter(Number.isFinite)
  return {
    week,
    reset,
    active: active.length,
    established: established.length,
    rmseEstablished: rmse(errors(established)),
    rmseAll: rmse(errors(active)),
    medianAbsError: quantile(errors(established).map(Math.abs), 0.5),
    biasAll: mean(errors(active)),
    biasEstablished: mean(errors(established)),
    spearman: spearman(established.map((r) => r.rating), established.map((r) => r.trueRating)),
    meanRating: mean(active.map((r) => r.rating)),
    meanTrue: mean(active.map((r) => r.trueRating)),
    poolTrueSpread: mean(pools.map((pool) => sd(pool.map((r) => r.trueRating))).filter(Number.isFinite)),
    pointsP50: quantile(weekly, 0.5),
    pointsP90: quantile(weekly, 0.9),
    pointsMax: Math.max(...weekly),
    pointsAbilityCorr: mean(poolCorr),
    ...tally,
  }
}
