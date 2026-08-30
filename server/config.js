import path from 'node:path'

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

// Railway injects PORT. Fall back to 3000 so a bare `npm start` works locally.
export const PORT = int(process.env.PORT, 3000)
export const HOST = process.env.HOST || '0.0.0.0'

// The SQLite file location always comes from the environment so the deploy can
// point it at a mounted volume that survives restarts.
export const DATABASE_PATH = path.resolve(
  process.env.DATABASE_PATH || './data/gap.db'
)

export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Discovery tuning: how close, and how evenly matched, an opponent must be.
export const DISCOVERY_RADIUS_M = int(process.env.DISCOVERY_RADIUS_M, 5000)
export const DISCOVERY_RATING_SPREAD = int(process.env.DISCOVERY_RATING_SPREAD, 250)

// A player is "online" for discovery purposes if we have heard from them
// recently, either over the socket or via a location update.
export const PRESENCE_TTL_MS = int(process.env.PRESENCE_TTL_MS, 90_000)

/**
 * Rate limits. The registration ceiling is deliberately generous: a room of
 * people signing up at a demo all share one wifi address, and a limit tuned
 * for a lone attacker would lock out the whole audience. Set
 * RATE_LIMIT_DISABLED=1 to turn limiting off entirely for a test run.
 */
export const RATE_LIMIT_DISABLED = ['1', 'true', 'yes'].includes(
  String(process.env.RATE_LIMIT_DISABLED ?? '').toLowerCase()
)
export const REGISTER_LIMIT = int(process.env.REGISTER_LIMIT, 30)
export const REGISTER_WINDOW_MS = int(process.env.REGISTER_WINDOW_MINUTES, 10) * 60_000
export const LOGIN_LIMIT = int(process.env.LOGIN_LIMIT, 10)
export const LOGIN_WINDOW_MS = int(process.env.LOGIN_WINDOW_MINUTES, 5) * 60_000

export const SESSION_TTL_MS = int(process.env.SESSION_TTL_DAYS, 30) * 86_400_000
export const AUTH_CODE_TTL_MS = int(process.env.AUTH_CODE_TTL_SECONDS, 300) * 1000
export const CHALLENGE_TTL_MS = int(process.env.CHALLENGE_TTL_SECONDS, 60) * 1000
