import { db, now } from './index.js'
import { newId } from '../lib/ids.js'

/**
 * Recorded runs, their tracks, and the ledgers they pay into. A run and
 * everything it pays out are written in one transaction, so balances and
 * ledgers can never disagree.
 */

const RUN_COLUMNS = `
  id, player_id, kind, private, started_at, ended_at, day, week, distance_m,
  elapsed_ms, status, flags, intensity, shards, fuel, points, ghost_ms, created_at
`

const selectRun = db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`)
const selectByStart = db.prepare(
  `SELECT ${RUN_COLUMNS} FROM runs WHERE player_id = ? AND started_at = ?`
)
const selectRecent = db.prepare(
  `SELECT ${RUN_COLUMNS} FROM runs WHERE player_id = ? ORDER BY started_at DESC LIMIT ?`
)
const selectEarned = db.prepare(`
  SELECT COALESCE(SUM(shards), 0) AS shards, COALESCE(SUM(fuel), 0) AS fuel,
         COALESCE(SUM(points), 0) AS points
  FROM runs WHERE player_id = ? AND day = ?
`)
const selectOverlap = db.prepare(
  'SELECT id FROM runs WHERE player_id = ? AND started_at <= ? AND ended_at >= ? LIMIT 1'
)
const selectStreakDays = db.prepare(`
  SELECT DISTINCT day FROM runs
  WHERE player_id = @player AND status = 'ok' AND distance_m >= @minDistance AND elapsed_ms >= @minMs
  ORDER BY day DESC LIMIT 1000
`)
const selectWeekly = db.prepare(`
  SELECT week, SUM(distance_m) AS distance_m, SUM(elapsed_ms) AS elapsed_ms, COUNT(*) AS runs
  FROM runs WHERE player_id = ? AND week >= ? AND status = 'ok'
  GROUP BY week
`)
const selectTrack = db.prepare('SELECT format, data FROM run_tracks WHERE run_id = ?')
const selectWeekPoints = db.prepare(
  'SELECT COALESCE(SUM(points), 0) AS points FROM point_events WHERE player_id = ? AND week = ?'
)

const insertRun = db.prepare(`
  INSERT INTO runs (${RUN_COLUMNS})
  VALUES (@id, @player_id, @kind, @private, @started_at, @ended_at, @day, @week, @distance_m,
          @elapsed_ms, @status, @flags, @intensity, @shards, @fuel, @points, @ghost_ms, @created_at)
`)
const insertTrack = db.prepare(
  'INSERT INTO run_tracks (run_id, format, samples, has_steps, data) VALUES (?, ?, ?, ?, ?)'
)
const insertPoints = db.prepare(`
  INSERT INTO point_events (id, player_id, week, source, ref_id, points, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)
const insertFuel = db.prepare(`
  INSERT INTO fuel_events (id, player_id, delta, reason, ref_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const creditPlayer = db.prepare(`
  UPDATE players SET
    shards = shards + @shards,
    fuel = fuel + @fuel,
    lifetime_m = lifetime_m + @metres,
    runs = runs + 1,
    streak_days = @streak_days,
    streak_last_day = @streak_last_day
  WHERE id = @player_id
`)

export const getRun = (id) => selectRun.get(id) ?? null
export const findRunByStart = (playerId, startedAt) => selectByStart.get(playerId, startedAt) ?? null
/** A stored run of this player's that shares any moment with [startedAt, endedAt]. */
export const findOverlappingRun = (playerId, startedAt, endedAt) =>
  selectOverlap.get(playerId, endedAt, startedAt) ?? null
/** Days on which this player has a run that kept the streak going. */
export const streakDays = (playerId, { minDistance, minMs }) =>
  selectStreakDays.all({ player: playerId, minDistance, minMs }).map((r) => r.day)
export const recentRuns = (playerId, limit = 30) => selectRecent.all(playerId, limit)
/** Distance, time and run count per week from `sinceWeek` on, weeks with no runs left out. */
export const weeklyTotals = (playerId, sinceWeek) => selectWeekly.all(playerId, sinceWeek)

/** Shards, Fuel and points a player's runs have already earned on a day, for the caps. */
export const earnedOn = (playerId, day) => selectEarned.get(playerId, day)

/** A run's stored track (lib/track.js encodeTrack), or null. */
export const getTrackData = (runId) => selectTrack.get(runId)?.data ?? null

export const weekPoints = (playerId, week) => selectWeekPoints.get(playerId, week).points

/**
 * Store a run with its track and pay it out.
 *
 *   run      the runs row, without id / created_at
 *   track    { format, samples, hasSteps, data }
 *   credit   { metres, streak: { days, lastDay } }
 */
export const recordRun = db.transaction(({ run, track, credit }) => {
  const id = newId()
  const ts = now()
  insertRun.run({ ...run, id, created_at: ts, flags: run.flags ?? null, ghost_ms: run.ghost_ms ?? null })
  insertTrack.run(id, track.format, track.samples, track.hasSteps ? 1 : 0, track.data)
  if (run.points > 0) insertPoints.run(newId(), run.player_id, run.week, run.kind, id, run.points, ts)
  if (run.fuel > 0) insertFuel.run(newId(), run.player_id, run.fuel, 'run', id, ts)
  creditPlayer.run({
    player_id: run.player_id,
    shards: run.shards,
    fuel: run.fuel,
    metres: credit.metres,
    streak_days: credit.streak.days,
    streak_last_day: credit.streak.lastDay,
  })
  return getRun(id)
})
