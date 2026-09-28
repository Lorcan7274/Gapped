import { db, now } from '../db/index.js'
import { newToken } from '../lib/ids.js'
import { SESSION_TTL_MS } from '../config/env.js'

/**
 * Sign-in issues an opaque token, and the token is the only credential — a
 * player id on its own proves nothing.
 */

const insert = db.prepare(
  'INSERT INTO sessions (token, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
)
const select = db.prepare('SELECT * FROM sessions WHERE token = ?')
const remove = db.prepare('DELETE FROM sessions WHERE token = ?')
const purge = db.prepare('DELETE FROM sessions WHERE expires_at < ?')

export function createSession(playerId) {
  const token = newToken()
  const ts = now()
  insert.run(token, playerId, ts, ts + SESSION_TTL_MS)
  return token
}

/** The player a live session belongs to; an expired session is deleted on sight. */
export function sessionPlayerId(token) {
  if (!token) return null
  const session = select.get(token)
  if (!session) return null
  if (session.expires_at < now()) {
    remove.run(token)
    return null
  }
  return session.player_id
}

export const destroySession = (token) => token && remove.run(token)
export const purgeExpiredSessions = () => purge.run(now())
