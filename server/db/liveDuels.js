import { db, now } from './index.js'
import { newId } from '../lib/ids.js'
import { CHALLENGE_TTL_MS } from '../config/env.js'

/* ------------------------------------------------------- live challenges */

const insertChallenge = db.prepare(`
  INSERT INTO live_challenges (id, from_id, to_id, mode, distance_m, duration_ms, status, created_at, expires_at)
  VALUES (@id, @from_id, @to_id, @mode, @distance_m, @duration_ms, 'pending', @created_at, @expires_at)
`)

const selectChallenge = db.prepare('SELECT * FROM live_challenges WHERE id = ?')
const setChallengeStatus = db.prepare(
  'UPDATE live_challenges SET status = ?, responded_at = ? WHERE id = ? AND status = \'pending\''
)
const selectStaleChallenges = db.prepare(
  "SELECT * FROM live_challenges WHERE status = 'pending' AND expires_at < ?"
)
const expireStaleChallenges = db.prepare(
  "UPDATE live_challenges SET status = 'expired' WHERE status = 'pending' AND expires_at < ?"
)

const countLiveFor = db.prepare(`
  SELECT COUNT(*) AS n FROM live_duels
  WHERE status = 'live' AND (a_id = ? OR b_id = ?)
`)

export function createChallenge({ fromId, toId, mode = 'race', distanceM = 0, durationMs = null }) {
  const ts = now()
  const challenge = {
    id: newId(),
    from_id: fromId,
    to_id: toId,
    mode,
    distance_m: distanceM ?? 0,
    duration_ms: durationMs,
    created_at: ts,
    expires_at: ts + CHALLENGE_TTL_MS,
  }
  insertChallenge.run(challenge)
  return selectChallenge.get(challenge.id)
}

export const getChallenge = (id) => selectChallenge.get(id) ?? null

// Returns true only if this call is the one that moved it out of `pending`,
// so two racing responses cannot both start a match.
export function resolveChallenge(id, status) {
  return setChallengeStatus.run(status, now(), id).changes === 1
}

/** Expire live_challenges nobody answered; returns the rows so both sides can be told. */
export function expireChallenges() {
  const ts = now()
  const rows = selectStaleChallenges.all(ts)
  if (rows.length > 0) expireStaleChallenges.run(ts)
  return rows
}

export const hasLiveMatch = (playerId) =>
  countLiveFor.get(playerId, playerId).n > 0

/* ------------------------------------------------------------ live duels */

const insertMatch = db.prepare(`
  INSERT INTO live_duels (
    id, challenge_id, a_id, b_id, mode, distance_m, duration_ms, status, started_at
  ) VALUES (
    @id, @challenge_id, @a_id, @b_id, @mode, @distance_m, @duration_ms, 'live', @started_at
  )
`)

const selectMatch = db.prepare('SELECT * FROM live_duels WHERE id = ?')
const selectLiveForPlayer = db.prepare(`
  SELECT * FROM live_duels
  WHERE status = 'live' AND (a_id = ? OR b_id = ?)
  ORDER BY started_at DESC LIMIT 1
`)

const setProgressA = db.prepare('UPDATE live_duels SET a_progress_m = ? WHERE id = ?')
const setProgressB = db.prepare('UPDATE live_duels SET b_progress_m = ? WHERE id = ?')
const setElapsedA = db.prepare('UPDATE live_duels SET a_elapsed_ms = ? WHERE id = ?')
const setElapsedB = db.prepare('UPDATE live_duels SET b_elapsed_ms = ? WHERE id = ?')

const finishMatch = db.prepare(`
  UPDATE live_duels
  SET status = 'finished', winner_id = @winner_id, finished_at = @finished_at
  WHERE id = @id AND status = 'live'
`)

const abandonMatch = db.prepare(`
  UPDATE live_duels SET status = 'abandoned', finished_at = ? WHERE id = ? AND status = 'live'
`)

export function createMatch({
  challengeId, aId, bId, mode = 'race', distanceM = 0, durationMs = null,
}) {
  const match = {
    id: newId(),
    challenge_id: challengeId ?? null,
    a_id: aId,
    b_id: bId,
    mode,
    distance_m: distanceM ?? 0,
    duration_ms: durationMs,
    started_at: now(),
  }
  insertMatch.run(match)
  return selectMatch.get(match.id)
}

export const getMatch = (id) => selectMatch.get(id) ?? null
export const getLiveMatchFor = (playerId) =>
  selectLiveForPlayer.get(playerId, playerId) ?? null

export function recordProgress(matchId, side, metres) {
  const stmt = side === 'a' ? setProgressA : setProgressB
  stmt.run(metres, matchId)
}

export function recordElapsed(matchId, side, elapsedMs) {
  const stmt = side === 'a' ? setElapsedA : setElapsedB
  stmt.run(elapsedMs, matchId)
}

/**
 * Settle a live duel. Live duels are social: they move no points and no
 * hidden rating, only who won. `winnerId` may be null for a draw. Returns
 * null if another caller settled it first.
 */
export function settleMatch(matchId, winnerId) {
  const changed = finishMatch.run({ id: matchId, winner_id: winnerId ?? null, finished_at: now() }).changes
  return changed === 1 ? { match: selectMatch.get(matchId) } : null
}

export function abandon(matchId) {
  return abandonMatch.run(now(), matchId).changes === 1
}
