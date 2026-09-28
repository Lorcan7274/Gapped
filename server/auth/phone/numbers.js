import crypto from 'node:crypto'

/**
 * Phone numbers are stored in E.164 (+15551234567). Parsing is permissive —
 * spaces, dots, dashes and parentheses are stripped, a 00 prefix becomes + —
 * but the result must carry a country code. There is no default-country
 * guess: a guessed prefix silently signs someone into the wrong account.
 */
export function normalisePhone(input) {
  if (typeof input !== 'string') return null
  let digits = input.replace(/[\s().-]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null
}

/**
 * Verification codes are short-lived secrets, so the database stores only a
 * digest. Salting with the phone number stops one leaked table row from
 * being replayed against another number.
 */
export const hashCode = (phone, code) =>
  crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex')
