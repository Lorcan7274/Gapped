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
const latestIssued = db.prepare(`
  SELECT * FROM auth_codes
  WHERE phone = ?
  ORDER BY created_at DESC LIMIT 1
`)
const livePending = db.prepare(`
  SELECT * FROM auth_codes
  WHERE phone = ? AND consumed_at IS NULL AND expires_at >= ?
  ORDER BY created_at DESC
`)
const countRecent = db.prepare(
  'SELECT COUNT(*) AS n FROM auth_codes WHERE phone = ? AND created_at >= ?'
)
const bumpAttempts = db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?')
const markConsumed = db.prepare(
  'UPDATE auth_codes SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL'
)
const purge = db.prepare('DELETE FROM auth_codes WHERE expires_at < ?')

/**
 * Mint a code for a number. Returns the plain code exactly once, here — the
 * table only ever holds the digest.
 */
export function issueCode(phone) {
  const ts = now()

  // The last code texted, consumed or not: the cooldown is about how
  // recently this number was messaged, and a completed sign-in retires codes
  // without un-sending the text it just sent.
  const last = latestIssued.get(phone)
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
 * Check a guess against every live code for a number — unconsumed and not
 * yet expired. Texts arrive late and out of order (a gateway phone replaying
 * its queue, an iOS keyboard suggesting the previous text), so the code a
 * player has in hand is not always the last one issued; any of them proves
 * the number for as long as it is live. Does NOT consume on success — the
 * route consumes only once it knows it can finish the sign-in, so "add a
 * name and resubmit" works on the same code.
 * Returns 'ok', 'invalid', 'expired' or 'too_many'.
 */
export function checkCode(phone, code) {
  const live = livePending.all(phone, now())
  if (live.length === 0) return { status: 'expired' }
  const open = live.filter((row) => row.attempts < MAX_ATTEMPTS)
  if (open.length === 0) return { status: 'too_many' }

  const guess = hashCode(phone, code)
  if (open.some((row) => safeEqual(guess, row.code_hash))) return { status: 'ok' }

  // A miss was tried against every open code, so it counts against each of
  // them: five misses lock the lot, whichever texts actually arrived.
  for (const row of open) bumpAttempts.run(row.id)
  return { status: 'invalid' }
}

/**
 * Retire every outstanding code for a number once its sign-in completed.
 * Any of them could have signed in, so none may stay usable in an inbox.
 */
export const consumeCodes = (phone) => markConsumed.run(now(), phone).changes > 0

export const purgeExpiredAuthCodes = () => purge.run(now())
