import { db, now } from './index.js'
import { newId, newAuthCode, safeEqual } from '../lib/ids.js'
import { hashCode } from '../lib/phone.js'
import { AUTH_CODE_TTL_MS } from '../config.js'

// One code every cooldown, a handful per hour, five guesses per code. Keeps
// a stranger from using request-code as an SMS cannon or brute-forcing six
// digits, without ever locking out someone whose text arrived late.
const RESEND_COOLDOWN_MS = 30_000
const QUOTA_WINDOW_MS = 3_600_000
const MAX_CODES_PER_WINDOW = 5
const MAX_ATTEMPTS = 5

const insert = db.prepare(`
  INSERT INTO auth_codes (id, phone, code_hash, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?)
`)
const latestPending = db.prepare(`
  SELECT * FROM auth_codes
  WHERE phone = ? AND consumed_at IS NULL
  ORDER BY created_at DESC LIMIT 1
`)
const countRecent = db.prepare(
  'SELECT COUNT(*) AS n FROM auth_codes WHERE phone = ? AND created_at >= ?'
)
const bumpAttempts = db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?')
const markConsumed = db.prepare(
  'UPDATE auth_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL'
)
const purge = db.prepare('DELETE FROM auth_codes WHERE expires_at < ?')

/**
 * Mint a code for a number. Returns the plain code exactly once, here — the
 * table only ever holds the digest.
 */
export function issueCode(phone) {
  const ts = now()

  const last = latestPending.get(phone)
  if (last && ts - last.created_at < RESEND_COOLDOWN_MS) {
    return {
      ok: false,
      reason: 'cooldown',
      retryInSeconds: Math.ceil((RESEND_COOLDOWN_MS - (ts - last.created_at)) / 1000),
    }
  }
  if (countRecent.get(phone, ts - QUOTA_WINDOW_MS).n >= MAX_CODES_PER_WINDOW) {
    return { ok: false, reason: 'quota', retryInSeconds: Math.ceil(QUOTA_WINDOW_MS / 1000) }
  }

  const code = newAuthCode()
  insert.run(newId(), phone, hashCode(phone, code), ts, ts + AUTH_CODE_TTL_MS)
  return { ok: true, code, ttlMs: AUTH_CODE_TTL_MS }
}

/**
 * Check a guess against the newest outstanding code for a number. Does NOT
 * consume on success — the route consumes only once it knows it can finish
 * the sign-in, so "add a name and resubmit" works on the same code.
 * Returns 'ok' (with the row id), 'invalid', 'expired' or 'too_many'.
 */
export function checkCode(phone, code) {
  const row = latestPending.get(phone)
  if (!row || row.expires_at < now()) return { status: 'expired' }
  if (row.attempts >= MAX_ATTEMPTS) return { status: 'too_many' }
  if (!safeEqual(hashCode(phone, code), row.code_hash)) {
    bumpAttempts.run(row.id)
    return { status: 'invalid' }
  }
  return { status: 'ok', id: row.id }
}

/** Retire a checked code once its sign-in actually completed. */
export const consumeCode = (id) => markConsumed.run(now(), id).changes === 1

export const purgeExpiredAuthCodes = () => purge.run(now())
