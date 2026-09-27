import { db, now } from './index.js'
import { newId } from '../lib/ids.js'

/**
 * Recorded runs, their tracks, and the ledgers they pay into. A run and
 * everything it pays out are written in one transaction, so balances and
 * ledgers can never disagree.
 */

const RUN_COLUMNS = `
  id, player_id, kind, private, started_at, ended_at, day, week, distance_m,
  elapsed_ms, status, flags, intensity, shards, fuel, points, created_at
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
  FROM runs WHERE player_id = ? AND day = ? AND kind = 'solo'
`)
const selectWeekPoints = db.prepare(
  'SELECT COALESCE(SUM(points), 0) AS points FROM point_events WHERE player_id = ? AND week = ?'
)

const insertRun = db.prepare(`
  INSERT INTO runs (${RUN_COLUMNS})
  VALUES (@id, @player_id, @kind, @private, @started_at, @ended_at, @day, @week, @distance_m,
          @elapsed_ms, @status, @flags, @intensity, @shards, @fuel, @points, @created_at)
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
export const recentRuns = (playerId, limit = 30) => selectRecent.all(playerId, limit)

/** Shards, Fuel and points a player's solo runs have already earned on a day, for the caps. */
export const earnedOn = (playerId, day) => selectEarned.get(playerId, day)

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
  insertRun.run({ ...run, id, created_at: ts, flags: run.flags ?? null })
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
