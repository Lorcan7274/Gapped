import crypto from 'node:crypto'

export const newId = () => crypto.randomUUID()
export const newToken = () => crypto.randomBytes(32).toString('base64url')

// Six digits, uniformly distributed, from a CSPRNG.
export const newAuthCode = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

// Constant-time compare that tolerates differing lengths.
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
