import { db, now } from './index.js'
import { newId } from '../lib/ids.js'
import { settle } from '../lib/elo.js'
import { CHALLENGE_TTL_MS } from '../config.js'

/* ---------------------------------------------------------------- challenges */

const insertChallenge = db.prepare(`
  INSERT INTO challenges (id, from_id, to_id, distance_m, status, created_at, expires_at)
  VALUES (@id, @from_id, @to_id, @distance_m, 'pending', @created_at, @expires_at)
`)

const selectChallenge = db.prepare('SELECT * FROM challenges WHERE id = ?')
const setChallengeStatus = db.prepare(
  'UPDATE challenges SET status = ?, responded_at = ? WHERE id = ? AND status = \'pending\''
)
const expireStaleChallenges = db.prepare(
  "UPDATE challenges SET status = 'expired' WHERE status = 'pending' AND expires_at < ?"
)

const countLiveFor = db.prepare(`
  SELECT COUNT(*) AS n FROM matches
  WHERE status = 'live' AND (a_id = ? OR b_id = ?)
`)

export function createChallenge({ fromId, toId, distanceM }) {
  const ts = now()
  const challenge = {
    id: newId(),
    from_id: fromId,
    to_id: toId,
    distance_m: distanceM,
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

export const expireChallenges = () => expireStaleChallenges.run(now()).changes

export const hasLiveMatch = (playerId) =>
  countLiveFor.get(playerId, playerId).n > 0

/* ------------------------------------------------------------------- matches */

const insertMatch = db.prepare(`
  INSERT INTO matches (
    id, challenge_id, a_id, b_id, distance_m, status,
    a_rating_before, b_rating_before, started_at
  ) VALUES (
    @id, @challenge_id, @a_id, @b_id, @distance_m, 'live',
    @a_rating_before, @b_rating_before, @started_at
  )
`)

const selectMatch = db.prepare('SELECT * FROM matches WHERE id = ?')
const selectLiveForPlayer = db.prepare(`
  SELECT * FROM matches
  WHERE status = 'live' AND (a_id = ? OR b_id = ?)
  ORDER BY started_at DESC LIMIT 1
`)

const setProgressA = db.prepare('UPDATE matches SET a_progress_m = ? WHERE id = ?')
const setProgressB = db.prepare('UPDATE matches SET b_progress_m = ? WHERE id = ?')
const setElapsedA = db.prepare('UPDATE matches SET a_elapsed_ms = ? WHERE id = ?')
const setElapsedB = db.prepare('UPDATE matches SET b_elapsed_ms = ? WHERE id = ?')

const finishMatch = db.prepare(`
  UPDATE matches
  SET status = 'finished', winner_id = @winner_id, finished_at = @finished_at,
      a_rating_after = @a_rating_after, b_rating_after = @b_rating_after
  WHERE id = @id AND status = 'live'
`)

const abandonMatch = db.prepare(`
  UPDATE matches SET status = 'abandoned', finished_at = ? WHERE id = ? AND status = 'live'
`)

const selectPlayerForUpdate = db.prepare(
  'SELECT id, rating, peak_rating, games, wins, losses, draws FROM players WHERE id = ?'
)

const applyResult = db.prepare(`
  UPDATE players
  SET rating = @rating,
      peak_rating = MAX(peak_rating, @rating),
      games = games + 1,
      wins = wins + @win,
      losses = losses + @loss,
      draws = draws + @draw
  WHERE id = @id
`)

export function createMatch({ challengeId, aId, bId, distanceM, aRating, bRating }) {
  const match = {
    id: newId(),
    challenge_id: challengeId ?? null,
    a_id: aId,
    b_id: bId,
    distance_m: distanceM,
    a_rating_before: aRating,
    b_rating_before: bRating,
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
 * Settle a live match and write both players' new ratings in one transaction.
 * `winnerId` may be null for a draw. Returns null if the match was already
 * settled by another caller.
 */
export const settleMatch = db.transaction((matchId, winnerId) => {
  const match = selectMatch.get(matchId)
  if (!match || match.status !== 'live') return null

  const a = selectPlayerForUpdate.get(match.a_id)
  const b = selectPlayerForUpdate.get(match.b_id)
  if (!a || !b) return null

  const scoreA = winnerId == null ? 0.5 : winnerId === a.id ? 1 : 0
  const result = settle(a, b, scoreA)

  const changed = finishMatch.run({
    id: matchId,
    winner_id: winnerId ?? null,
    finished_at: now(),
    a_rating_after: result.a.rating,
    b_rating_after: result.b.rating,
  }).changes
  if (changed !== 1) return null

  applyResult.run({
    id: a.id,
    rating: result.a.rating,
    win: scoreA === 1 ? 1 : 0,
    loss: scoreA === 0 ? 1 : 0,
    draw: scoreA === 0.5 ? 1 : 0,
  })
  applyResult.run({
    id: b.id,
    rating: result.b.rating,
    win: scoreA === 0 ? 1 : 0,
    loss: scoreA === 1 ? 1 : 0,
    draw: scoreA === 0.5 ? 1 : 0,
  })

  return { match: selectMatch.get(matchId), result }
})

export function abandon(matchId) {
  return abandonMatch.run(now(), matchId).changes === 1
}

export function recentMatchesFor(playerId, limit = 20) {
  return db
    .prepare(
      `SELECT m.*, pa.display_name AS a_name, pb.display_name AS b_name
       FROM matches m
       JOIN players pa ON pa.id = m.a_id
       JOIN players pb ON pb.id = m.b_id
       WHERE (m.a_id = ? OR m.b_id = ?) AND m.status = 'finished'
       ORDER BY m.finished_at DESC
       LIMIT ?`
    )
    .all(playerId, playerId, limit)
}
