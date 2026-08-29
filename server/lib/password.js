import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)

// Deliberately Node's own scrypt: no dependency, and nothing to compile.
// This project has already lost a deploy to a native module that would not
// build, and an auth system is the last place to invite that back.
const KEY_LEN = 64
const SALT_LEN = 16
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN)
  const key = await scrypt(password, salt, KEY_LEN, PARAMS)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const [scheme, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, PARAMS)
  // Constant time, so a wrong password cannot be found byte by byte.
  return crypto.timingSafeEqual(expected, actual)
}

// Anything obviously not an address is rejected here; the real test is
// whether someone can sign back in with it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normaliseEmail(input) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim().toLowerCase()
  return EMAIL_RE.test(trimmed) && trimmed.length <= 254 ? trimmed : null
}

export function checkPassword(input) {
  if (typeof input !== 'string') return 'Enter a password.'
  if (input.length < 8) return 'Use at least 8 characters.'
  if (input.length > 200) return 'That password is too long.'
  return null
}
