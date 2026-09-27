import { ratingForTime, expectedTime } from '../lib/rating.js'

/**
 * What the simulation assumes about real runners. These are guesses about
 * the world, not game rules — the game's own numbers live in
 * config/game.js — and every one can be overridden from the command line to
 * see how sensitive the engine is to it.
 */
export const WORLD = Object.freeze({
  players: 600,
  weeks: 36,
  poolSize: 25,

  // True ability: 5k times log-normal around 28:00, about ±20% (1 sd).
  median5kS: 1680,
  ability: 0.2,
  // Personal endurance: some runners fade over distance more than Riegel's
  // 1.06 says, some less. The engine only knows the average.
  exponentMean: 1.06,
  exponentSd: 0.025,
  // Day-to-day form, per run (sd of log time), drawn per runner.
  dayNoiseMin: 0.02,
  dayNoiseMax: 0.045,
  // GPS timing error per run (sd of log time).
  gpsNoise: 0.01,

  // Solo runs are mostly easier than duel efforts: each runner's easy runs
  // are this much slower on average (drawn per runner), and 20% of solo
  // runs are hard efforts anyway.
  soloSlackMin: 0.03,
  soloSlackMax: 0.22,
  hardSoloShare: 0.2,
  runsPerWeekMin: 1,
  runsPerWeekMax: 5,
  // Preferred distance per runner (median, log sd), and spread per run.
  distanceMedianM: 6000,
  distanceSpread: 0.45,
  runDistanceSpread: 0.3,

  // Behaviour.
  duelRateMax: 2.5, // duels started per week, Poisson mean drawn from [0, max]
  duelCapPerWeek: 3,
  replyMin: 0.55, // chance of replying to a challenge, drawn per runner
  replyMax: 0.95,
  randomQuitRate: 0.02, // per leg: injuries, dead phones
  strategicShare: 0.1, // quit or withdraw whenever it scores better
  cherryPickShare: 0.5, // challenge the target's slowest run of the week

  // Placement: most people self-report a little optimistically; some skip it.
  noPlacementShare: 0.3,
  placementBias: 30,
  placementSd: 120,

  // Churn and change over time.
  joinRate: 0.02, // new runners per week, as a share of the starting population
  leaveRate: 0.005,
  improverShare: 0.3,
  improveMin: 3, // rating points per week when they start...
  improveMax: 10,
  improveHalfLifeWeeks: 12, // ...halving every this many weeks
  driftSd: 4, // everyone's ability wanders a little week to week
})

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

/** A new runner, true ability and habits drawn from the world. */
export function createRunner(rng, world, rating, week, id) {
  const true5k = rng.logNormal(world.median5kS, world.ability)
  const trueRating = clamp(ratingForTime(true5k, 5000, rating), rating.minRating + 50, rating.maxRating - 50)
  const placed = !rng.chance(world.noPlacementShare)
  const start = placed
    ? clamp(trueRating + rng.normal(world.placementBias, world.placementSd), rating.minRating, rating.maxRating)
    : rating.defaultRating
  return {
    id,
    joinedWeek: week,
    active: true,
    trueRating,
    exponent: rng.normal(world.exponentMean, world.exponentSd),
    dayNoise: rng.uniform(world.dayNoiseMin, world.dayNoiseMax),
    soloSlack: rng.uniform(world.soloSlackMin, world.soloSlackMax),
    runsPerWeek: rng.uniform(world.runsPerWeekMin, world.runsPerWeekMax),
    distancePref: clamp(rng.logNormal(world.distanceMedianM, world.distanceSpread), 2000, 15_000),
    duelRate: rng.uniform(0, world.duelRateMax),
    replyProb: rng.uniform(world.replyMin, world.replyMax),
    strategic: rng.chance(world.strategicShare),
    cherryPicker: rng.chance(world.cherryPickShare),
    improveRate: rng.chance(world.improverShare) ? rng.uniform(world.improveMin, world.improveMax) : 0,
    placed,
    // What the engine knows.
    rating: start,
    results: 0,
    // Bookkeeping.
    lifetimeResults: 0,
    errorByResults: [Math.abs(start - trueRating)],
    points: 0,
    duelsStarted: 0,
    duelPointsStarted: 0,
    quits: 0,
  }
}

/** How long this runner really takes today, at `slack` below full effort. */
export function runTime(rng, world, rating, runner, distanceM, slack) {
  const flat = expectedTime(runner.trueRating, rating.anchorDistanceM, rating)
  const riegel = (distanceM / rating.anchorDistanceM) ** runner.exponent
  const form = Math.exp(rng.normal(0, runner.dayNoise) + rng.normal(0, world.gpsNoise))
  return flat * riegel * (1 + slack) * form
}

/** One week of ability change: improvers improve, everyone wanders. */
export function evolve(rng, world, rating, runner, week) {
  const age = week - runner.joinedWeek
  const improvement = runner.improveRate * 0.5 ** (age / world.improveHalfLifeWeeks)
  runner.trueRating = clamp(
    runner.trueRating + improvement + rng.normal(0, world.driftSd),
    rating.minRating + 50,
    rating.maxRating - 50
  )
}
