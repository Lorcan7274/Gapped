/**
 * A sliding-window counter, held in memory.
 *
 * Deliberately not a dependency and not in SQLite: limits are per process
 * and reset on deploy, which is the right trade for a single-node service.
 * If this ever runs on more than one node the limits become per node, and
 * that is the point to move them into the database.
 */
import {
  RATE_LIMIT_DISABLED, REGISTER_LIMIT, REGISTER_WINDOW_MS,
  LOGIN_LIMIT, LOGIN_WINDOW_MS,
} from '../config.js'

export function createLimiter({ limit, windowMs, name = 'limit' }) {
  const hits = new Map()

  // Old keys would otherwise pile up for every address ever seen.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, times] of hits) {
      const kept = times.filter((t) => t > cutoff)
      if (kept.length === 0) hits.delete(key)
      else hits.set(key, kept)
    }
  }, Math.max(windowMs, 30_000))
  sweep.unref()

  return {
    name,
    /** Returns null when allowed, or seconds to wait when not. */
    check(key) {
      if (RATE_LIMIT_DISABLED) return null
      const now = Date.now()
      const cutoff = now - windowMs
      const times = (hits.get(key) ?? []).filter((t) => t > cutoff)
      if (times.length >= limit) {
        return Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000))
      }
      times.push(now)
      hits.set(key, times)
      return null
    },
    reset(key) {
      hits.delete(key)
    },
  }
}

/** Wrong passwords are counted per address and per caller. */
export const loginLimiter = createLimiter({
  limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS, name: 'login',
})
/** Account creation, per caller. Generous by default — see config.js. */
export const registerLimiter = createLimiter({
  limit: REGISTER_LIMIT, windowMs: REGISTER_WINDOW_MS, name: 'register',
})

export function clientKey(request) {
  // trustProxy is on, so request.ip is the forwarded address on Railway.
  return request.ip || 'unknown'
}
