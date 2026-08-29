// Normalise to E.164-ish: a leading + and 8-15 digits. We deliberately do not
// try to be a full phone-number library here.
export function normalisePhone(input) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`
}

const HANDLE_RE = /^[a-z0-9_]{3,16}$/i

export function normaliseHandle(input) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return HANDLE_RE.test(trimmed) ? trimmed : null
}

// Race distances players can pick, in metres.
export const DISTANCES = [400, 800, 1000, 1600, 3000, 5000]

export function normaliseDistance(input) {
  const n = Number(input)
  return DISTANCES.includes(n) ? n : null
}

export function suggestHandle(phone) {
  const tail = phone.slice(-4)
  return `runner${tail}${String(Math.floor(Math.random() * 90) + 10)}`
}
