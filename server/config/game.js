/**
 * Every game-balance number lives here: rating curve, update speeds, duel
 * points, seasons. They are product decisions, so they are versioned code —
 * not environment variables — and the simulation harness (server/sim) reads
 * these same objects as its baseline when it sweeps alternatives.
 *
 * Nothing in this file is ever shown to players. The hidden rating is
 * matchmaking machinery; players see pool points, Shards, Fuel and tiers.
 */

/**
 * The hidden rating (MMR) and how it moves.
 *
 * A rating is a pace: a runner rated `anchorRating` is expected to run
 * `anchorDistanceM` in `anchorTimeS`, and every `pointsPerDoubling` points
 * halves the time — so 100 points is about 7% faster. Other distances follow
 * Riegel's endurance curve, time ∝ distance^`distanceExponent`. Because the
 * scale is logarithmic, the expected gap between two ratings is the same
 * fraction of the race at every distance.
 */
export const RATING = Object.freeze({
  anchorRating: 1000,
  anchorDistanceM: 5000,
  anchorTimeS: 1800,
  pointsPerDoubling: 1000,
  distanceExponent: 1.06,

  // The curve is only trusted over this range; anything outside is refused.
  minDistanceM: 400,
  maxDistanceM: 50_000,
  minRating: 0,
  maxRating: 3000,

  // Where a player with no placement starts.
  defaultRating: 1000,

  // How far one duel can move a rating: kEstablished at most, once a player
  // has `provisionalResults` in-app results; kProvisional for the very first,
  // decaying linearly in between.
  // 20 rather than 30: in simulation it holds error lowest over a year and
  // leaves the least inflation for re-anchoring to take back out.
  kEstablished: 20,
  kProvisional: 120,
  provisionalResults: 5,

  // Surprise (in rating points) is squashed through tanh(surprise / scale),
  // so one freak result — a GPS glitch, a bonk — cannot move a rating more
  // than K however wild it looks.
  surpriseScale: 200,

  // An established player facing a provisional one moves at this fraction of
  // their usual speed: the provisional rating is the likelier to be wrong.
  provisionalOpponentDamping: 0.5,

  /**
   * What a completed duel's rating update compares:
   *  'combined' — the whole visible duel: the challenger's run against the
   *               target's ghost run and the target's reply (the spec as
   *               written: combined margin vs expected combined margin);
   *  'efforts'  — only the two duel efforts (challenger's run vs the
   *               target's reply), leaving out the ghost, which may have been
   *               an easy solo run the challenger picked for being slow.
   * Points always follow the visible combined margin either way. 'efforts':
   * in simulation, 'combined' let easy solo ghosts swamp the signal.
   */
  evidence: 'efforts',

  // A quit leg counts as finished at the expected losing margin: the
  // quitter's expected time (or the time they were racing, whichever is
  // slower), plus this penalty — about a bad day's worth — so quitting is
  // never better than an ordinary bad run.
  quitPenalty: 0.05,

  // Combined margins this close (seconds) are a tie.
  tieSeconds: 1,
})

/**
 * Pool points from ghost duels. The winner's points scale with how
 * surprising the win was relative to both hidden ratings, so an upset pays
 * more than a favourite winning as expected, and the visible table inherits
 * the fairness without anyone seeing the maths.
 */
export const DUEL_POINTS = Object.freeze({
  base: 30,
  // Surprise (rating points, from the winner's side) at which the winner's
  // multiplier has moved by 1: +150 doubles the base, -150 would zero it.
  scale: 150,
  minMultiplier: 0.5,
  maxMultiplier: 3,
  // A loser who beat expectations (lost by less than predicted) gets up to
  // this fraction of the base.
  consolationRate: 0.25,
  // Each side's share of the base on a tie.
  tieShare: 0.5,
  // Challenge ignored until Sunday: the challenger takes this many points
  // straight off the target.
  walkoverSteal: 10,
})

/**
 * Seasons: every `lengthWeeks` the hidden scale is reset. A rating is a pace,
 * so squashing ratings toward the middle makes them wrong — in simulation
 * even 0.9 doubled the error — and does nothing about inflation. The reset
 * re-anchors the scale to measured pace instead; the squash stays available.
 */
export const SEASON = Object.freeze({
  lengthWeeks: 9,
  // new = centre + (old - centre) * squash; 1 leaves the spread alone.
  squash: 1,
  // After a reset each player counts as this many results short of
  // established (never below zero), so K is briefly higher while ratings
  // find their level again.
  provisionalBoost: 0,
  // Re-anchoring: at each reset, shift every rating by the season's measured
  // pace drift (see paceDrift in lib/rating.js) so the scale keeps meaning
  // real paces.
  reanchor: true,
  // Fewer real duel efforts than this in a season and no shift is made.
  reanchorMinEfforts: 200,
  // The most one reset may shift the scale, in rating points.
  reanchorMaxShift: 100,
})

/** The game's calendar: days, weeks (Monday to Sunday night) and streaks. */
export const CALENDAR = Object.freeze({
  timeZone: 'Europe/Dublin',
})

/**
 * The visible ladder: tiers, each split into divisions (Gold III → Gold I).
 * Divisions per tier adapt to the population — one while the game is small,
 * so pools fill, rising toward 3–5 at scale. Pools and promotion arrive in
 * phase 4; until then everyone sits where the migration seeded them.
 */
export const LADDER = Object.freeze({
  tiers: Object.freeze([
    Object.freeze({ key: 'bronze', name: 'Bronze', colour: '#b2724a' }),
    Object.freeze({ key: 'silver', name: 'Silver', colour: '#9aa7b4' }),
    Object.freeze({ key: 'gold', name: 'Gold', colour: '#c8a233' }),
    Object.freeze({ key: 'sapphire', name: 'Sapphire', colour: '#4f46e5' }),
    Object.freeze({ key: 'amethyst', name: 'Amethyst', colour: '#8b5cf6' }),
    Object.freeze({ key: 'diamond', name: 'Diamond', colour: '#6aa8ff' }),
  ]),
  divisionsPerTier: 1,
})

/** What an uploaded run must look like before the server believes it. */
export const TRACK = Object.freeze({
  maxSamples: 30_000,
  maxDurationMs: 6 * 3_600_000,
  // An upload may arrive late (no signal at the end of a run), but not days late.
  maxAgeMs: 7 * 86_400_000,
  clockSkewMs: 120_000,
  // The same filter the phone runs live (client/src/lib/tracker.js).
  maxAccuracyM: 25,
  maxSpeedMps: 11,
  minStepM: 3,
  // Plausibility flags that settle a run unranked, pending review. Richer,
  // rating-conditioned checks arrive with anti-cheat in phase 6.
  maxAverageSpeedMps: 6.7, // quicker than a world-record 5k, held for the whole run
  maxRejectedShare: 0.5,
})

/**
 * Shards: the permanent progression currency. Per run,
 *   minutes × intensity^intensityExponent × perMinute × streak multiplier,
 * where intensity is expected race time at your hidden rating over the
 * distance, divided by your time — 1 is running at your race pace. So a hard
 * short run and a long easy one both pay honestly, and a short jog pays
 * nothing: under `minMinutes` earns zero, ramping to full at `fullMinutes`.
 */
export const SHARDS = Object.freeze({
  perMinute: 1,
  intensityExponent: 2,
  maxIntensity: 1.2,
  minMinutes: 10,
  fullMinutes: 15,
  dailyCap: 120,
})

/** Fuel: earned by running (from the Shards a run earns), spent to start fights. */
export const FUEL = Object.freeze({
  perShard: 0.25,
  dailyCap: 20,
})

/** Solo runs pay a little into the weekly pool table: Shard-scaled, capped per day. */
export const SOLO_POINTS = Object.freeze({
  perShard: 0.1,
  dailyCap: 8,
})

/** Streaks: consecutive days with a qualifying run; a small Shards multiplier. */
export const STREAK = Object.freeze({
  minMinutes: 10,
  bonusPerDay: 0.02,
  maxBonusDays: 6,
})
