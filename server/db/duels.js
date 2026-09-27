import { db, now } from './index.js'
import { newId } from '../lib/ids.js'
import { weekOf } from '../lib/economy.js'
import { verdictFor } from '../lib/duel.js'
import { getPlayer } from './players.js'
import { recordRun } from './runs.js'

/**
 * Ghost duels: starting one (the challenger pays Fuel), the reply, the legs
 * as they come in, and settlement. Every change to a duel and the balances
 * it moves happens in one transaction, and settling is idempotent — the
 * Sunday job can run as often as it likes.
 */

const COLUMNS = `
  id, week, status, challenger_id, target_id, ghost_run_id, distance_m, ghost_ms,
  fuel_cost, leg1_started_at, leg1_run_id, leg1_ms, leg1_quit, leg2_started_at,
  leg2_run_id, leg2_ms, leg2_quit, outcome, margin_ms, challenger_points,
  target_points, challenger_mmr_delta, target_mmr_delta, created_at, settled_at
`
const OPEN = "('leg1', 'awaiting', 'leg2')"

const selectDuel = db.prepare(`SELECT ${COLUMNS} FROM duels WHERE id = ?`)
const selectForPlayer = db.prepare(`
  SELECT ${COLUMNS} FROM duels
  WHERE (challenger_id = @player OR target_id = @player)
    AND (status IN ${OPEN} OR week >= @since)
  ORDER BY created_at DESC LIMIT @limit
`)
const selectOpenLeg = db.prepare(`
  SELECT ${COLUMNS} FROM duels
  WHERE (challenger_id = @player AND status = 'leg1') OR (target_id = @player AND status = 'leg2')
`)
const selectOpenBetween = db.prepare(`
  SELECT ${COLUMNS} FROM duels
  WHERE status IN ${OPEN}
    AND ((challenger_id = @a AND target_id = @b) OR (challenger_id = @b AND target_id = @a))
  LIMIT 1
`)
const selectDue = db.prepare(`SELECT id FROM duels WHERE status IN ${OPEN} AND week < ?`)
const selectFeed = db.prepare(`
  SELECT r.id, r.player_id, r.started_at, r.distance_m, r.elapsed_ms, r.ghost_ms,
         p.display_name, p.ladder_tier, p.ladder_division, p.created_at AS player_created_at
  FROM runs r JOIN players p ON p.id = r.player_id
  WHERE r.player_id != @player AND r.private = 0 AND r.status = 'ok' AND r.kind = 'solo'
    AND r.distance_m >= @minDistance AND r.distance_m <= @maxDistance AND r.started_at >= @since
    AND NOT EXISTS (SELECT 1 FROM duels d WHERE d.ghost_run_id = r.id AND d.challenger_id = @player)
  ORDER BY r.started_at DESC LIMIT @limit
`)

const insertDuel = db.prepare(`
  INSERT INTO duels (id, week, status, challenger_id, target_id, ghost_run_id, distance_m,
                     ghost_ms, fuel_cost, leg1_started_at, created_at)
  VALUES (@id, @week, 'leg1', @challenger_id, @target_id, @ghost_run_id, @distance_m,
          @ghost_ms, @fuel_cost, @leg1_started_at, @created_at)
`)
const spendFuel = db.prepare('UPDATE players SET fuel = fuel - @cost WHERE id = @id AND fuel >= @cost')
const refundFuel = db.prepare('UPDATE players SET fuel = fuel + ? WHERE id = ?')
const insertFuel = db.prepare(`
  INSERT INTO fuel_events (id, player_id, delta, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
`)
const insertPoints = db.prepare(`
  INSERT INTO point_events (id, player_id, week, source, ref_id, points, created_at)
  VALUES (?, ?, ?, 'duel', ?, ?, ?)
`)
const setRating = db.prepare(
  'UPDATE players SET mmr = @mmr, mmr_results = mmr_results + @counted WHERE id = @id'
)
const startLeg2 = db.prepare(
  "UPDATE duels SET status = 'leg2', leg2_started_at = ? WHERE id = ? AND status = 'awaiting'"
)
const setLeg1 = db.prepare(`
  UPDATE duels SET leg1_run_id = @run, leg1_ms = @ms, leg1_quit = @quit,
                   status = CASE WHEN @quit = 1 THEN 'leg1' ELSE 'awaiting' END
  WHERE id = @id AND status = 'leg1'
`)
const setLeg2 = db.prepare(`
  UPDATE duels SET leg2_run_id = @run, leg2_ms = @ms, leg2_quit = @quit
  WHERE id = @id AND status = 'leg2'
`)
const finish = db.prepare(`
  UPDATE duels SET status = @status, outcome = @outcome, margin_ms = @margin_ms,
    challenger_points = @challenger_points, target_points = @target_points,
    challenger_mmr_delta = @challenger_mmr_delta, target_mmr_delta = @target_mmr_delta,
    settled_at = @settled_at
  WHERE id = @id AND status IN ${OPEN}
`)
const setGhostMs = db.prepare('UPDATE runs SET ghost_ms = ? WHERE id = ?')

export const getDuel = (id) => (id ? selectDuel.get(id) ?? null : null)
export const duelsFor = (playerId, { since, limit = 50 }) =>
  selectForPlayer.all({ player: playerId, since, limit })
export const openLegFor = (playerId) => selectOpenLeg.all({ player: playerId })
export const openDuelBetween = (a, b) => selectOpenBetween.get({ a, b }) ?? null
export const feedFor = (playerId, opts) => selectFeed.all({ player: playerId, ...opts })
export const rememberGhostMs = (runId, ms) => setGhostMs.run(Math.round(ms), runId)

export class DuelError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * Start a duel: the challenger pays and leg one begins. Any leg the
 * challenger left running is settled as quit first — you cannot be in two
 * races at once.
 */
export const createDuel = db.transaction(({ challengerId, run, ghostMs, fuelCost, at = now() }) => {
  if (openDuelBetween(challengerId, run.player_id)) {
    throw new DuelError('duel_exists', 'You already have a duel going with them. Finish that one first.')
  }
  for (const open of openLegFor(challengerId)) quitLeg(open, challengerId, at)
  if (spendFuel.run({ id: challengerId, cost: fuelCost }).changes === 0) {
    throw new DuelError('fuel_short', `A duel costs ${fuelCost} Fuel. Run to earn more.`)
  }
  const id = newId()
  insertFuel.run(newId(), challengerId, -fuelCost, 'duel', id, at)
  insertDuel.run({
    id,
    week: weekOf(at),
    challenger_id: challengerId,
    target_id: run.player_id,
    ghost_run_id: run.id,
    distance_m: run.distance_m,
    ghost_ms: Math.round(ghostMs),
    fuel_cost: fuelCost,
    leg1_started_at: at,
    created_at: at,
  })
  return getDuel(id)
})

/** The target starts racing the challenger's run back. */
export const startReply = db.transaction((duelId, targetId, at = now()) => {
  const duel = getDuel(duelId)
  if (!duel || duel.target_id !== targetId) throw new DuelError('duel_missing', 'That duel is not yours to reply to.')
  if (duel.status !== 'awaiting') throw new DuelError('duel_closed', 'That duel is not waiting for a reply.')
  for (const open of openLegFor(targetId)) quitLeg(open, targetId, at)
  startLeg2.run(at, duelId)
  return getDuel(duelId)
})

/** A leg someone walked away from: it counts as quit, and is settled if that decides it. */
function quitLeg(duel, playerId, at) {
  if (duel.status === 'leg1' && duel.challenger_id === playerId) {
    setLeg1.run({ id: duel.id, run: null, ms: null, quit: 1 })
  } else if (duel.status === 'leg2' && duel.target_id === playerId) {
    setLeg2.run({ id: duel.id, run: null, ms: null, quit: 1 })
  } else return
  settle(duel.id, at)
}

/**
 * Store a leg's run (paid like any run) and put it on the duel, settling the
 * duel if that decides it. `leg` is 1 or 2; `ms` is the time to cover the
 * duel distance, or null for a quit. A flagged run voids the duel.
 */
export const recordLeg = db.transaction(({ duelId, leg, ms, quarantined, runInput, at = now() }) => {
  const duel = getDuel(duelId)
  if (!duel || duel.status !== (leg === 1 ? 'leg1' : 'leg2') || (leg === 1 && duel.leg1_quit)) {
    throw new DuelError('duel_closed', 'That duel has already been settled.')
  }
  const run = recordRun(runInput)
  const quit = ms == null ? 1 : 0
  if (leg === 1) setLeg1.run({ id: duelId, run: run.id, ms: quit ? null : Math.round(ms), quit })
  else setLeg2.run({ id: duelId, run: run.id, ms: quit ? null : Math.round(ms), quit })
  if (quarantined) voidDuel(duelId, at)
  else settle(duelId, at)
  return { run, duel: getDuel(duelId) }
})

/** Nothing moves; the challenger gets their Fuel back. Quiet — no labels. */
function voidDuel(duelId, at) {
  const duel = getDuel(duelId)
  if (!duel || !['leg1', 'awaiting', 'leg2'].includes(duel.status)) return
  const changed = finish.run({
    id: duelId, status: 'void', outcome: 'void', margin_ms: null,
    challenger_points: 0, target_points: 0, challenger_mmr_delta: 0, target_mmr_delta: 0,
    settled_at: at,
  }).changes
  if (!changed) return
  refundFuel.run(duel.fuel_cost, duel.challenger_id)
  insertFuel.run(newId(), duel.challenger_id, duel.fuel_cost, 'duel_refund', duelId, at)
}

/**
 * Settle a duel if it is decided (see lib/duel.js verdictFor): points into
 * the duel's week, hidden ratings moved. Returns the duel either way.
 */
export const settle = db.transaction((duelId, at = now()) => {
  const duel = getDuel(duelId)
  if (!duel) return null
  const challenger = getPlayer(duel.challenger_id)
  const target = getPlayer(duel.target_id)
  const verdict = verdictFor(duel, challenger, target, { deadlinePassed: weekOf(at) > duel.week })
  if (!verdict) return duel

  const changed = finish.run({
    id: duelId,
    status: 'settled',
    outcome: verdict.outcome,
    margin_ms: verdict.marginS == null ? null : Math.round(verdict.marginS * 1000),
    challenger_points: verdict.points.challenger,
    target_points: verdict.points.target,
    challenger_mmr_delta: verdict.rating.challenger.delta,
    target_mmr_delta: verdict.rating.target.delta,
    settled_at: at,
  }).changes
  if (!changed) return getDuel(duelId)

  for (const [player, side] of [[challenger, 'challenger'], [target, 'target']]) {
    const points = verdict.points[side]
    if (points !== 0) insertPoints.run(newId(), player.id, duel.week, duelId, points, at)
    setRating.run({ id: player.id, mmr: verdict.rating[side].after, counted: verdict.counted[side] ? 1 : 0 })
  }
  return getDuel(duelId)
})

/** Sunday night: settle every duel whose week is over. Safe to run any time, any number of times. */
export function settleDue(at = now()) {
  const due = selectDue.all(weekOf(at))
  for (const { id } of due) settle(id, at)
  return due.length
}
