import { db, now } from './index.js'
import { newToken } from '../lib/ids.js'
import { SESSION_TTL_MS } from '../config.js'

const upsertCode = db.prepare(`
  INSERT INTO auth_codes (phone, code, expires_at, attempts, created_at)
  VALUES (@phone, @code, @expires_at, 0, @created_at)
  ON CONFLICT (phone) DO UPDATE SET
    code = excluded.code,
    expires_at = excluded.expires_at,
    attempts = 0,
    created_at = excluded.created_at
`)

const selectCode = db.prepare('SELECT * FROM auth_codes WHERE phone = ?')
const bumpAttempts = db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE phone = ?')
const deleteCode = db.prepare('DELETE FROM auth_codes WHERE phone = ?')

const insertSession = db.prepare(`
  INSERT INTO sessions (token, player_id, created_at, expires_at)
  VALUES (?, ?, ?, ?)
`)
const selectSession = db.prepare('SELECT * FROM sessions WHERE token = ?')
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?')
const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at < ?')

export function putAuthCode(phone, code, ttlMs) {
  const ts = now()
  upsertCode.run({ phone, code, expires_at: ts + ttlMs, created_at: ts })
}

export const getAuthCode = (phone) => selectCode.get(phone) ?? null
export const recordCodeAttempt = (phone) => bumpAttempts.run(phone)
export const clearAuthCode = (phone) => deleteCode.run(phone)

export function createSession(playerId) {
  const token = newToken()
  const ts = now()
  insertSession.run(token, playerId, ts, ts + SESSION_TTL_MS)
  return token
}

export function resolveSession(token) {
  if (!token) return null
  const session = selectSession.get(token)
  if (!session) return null
  if (session.expires_at < now()) {
    deleteSession.run(token)
    return null
  }
  return session
}

export const destroySession = (token) => deleteSession.run(token)
export const purgeExpiredSessions = () => deleteExpiredSessions.run(now())
