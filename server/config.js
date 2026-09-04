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
  process.env.DATABASE_PATH || './data/gapped.db'
)

export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Discovery tuning: how close, and how evenly matched, an opponent must be.
export const DISCOVERY_RADIUS_M = int(process.env.DISCOVERY_RADIUS_M, 5000)
export const DISCOVERY_RATING_SPREAD = int(process.env.DISCOVERY_RATING_SPREAD, 250)

// A player is "online" for discovery purposes if we have heard from them
// recently, either over the socket or via a location update.
export const PRESENCE_TTL_MS = int(process.env.PRESENCE_TTL_MS, 90_000)

export const SESSION_TTL_MS = int(process.env.SESSION_TTL_DAYS, 30) * 86_400_000
export const AUTH_CODE_TTL_MS = int(process.env.AUTH_CODE_TTL_SECONDS, 300) * 1000
export const CHALLENGE_TTL_MS = int(process.env.CHALLENGE_TTL_SECONDS, 60) * 1000

// How long a quick-match search stays live. Queueing is a claim to be ready
// right now, and a phone that went into a pocket a quarter of an hour ago is
// not — so the search is dropped rather than yanking someone into a duel.
export const QUEUE_TTL_MS = int(process.env.QUEUE_TTL_MINUTES, 15) * 60_000

// textbee (textbee.dev) delivers verification codes through an Android phone
// paired with the account. With no key set, codes are only logged — and
// echoed in the request-code response outside production (see below).
export const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY || null
// Which paired phone sends. Optional: textbee falls back to the default
// device, or the enabled one heard from most recently.
export const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID || null

// Whether the verification code is echoed in the request-code response.
// Defaults to on outside production so sign-in works with no SMS provider;
// force it with AUTH_CODE_ECHO=1 for a demo deploy, knowing anyone can then
// sign in as any number.
export const AUTH_CODE_ECHO = process.env.AUTH_CODE_ECHO != null
  ? ['1', 'true'].includes(process.env.AUTH_CODE_ECHO)
  : !IS_PRODUCTION
