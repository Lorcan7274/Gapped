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

// Where an in-duel video call looks for a route between the two phones. STUN
// is enough on most Wi-Fi, but carrier networks often hide phones behind NATs
// that refuse a direct path, and only a TURN relay (Metered, Twilio, a
// self-hosted coturn) gets those calls through. TURN entries carry
// credentials, so this only ever goes out in authenticated socket frames.
export const ICE_SERVERS = (() => {
  const raw = process.env.ICE_SERVERS_JSON
  if (!raw) return [{ urls: 'stun:stun.l.google.com:19302' }]
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    /* reported below */
  }
  if (!Array.isArray(parsed)) {
    throw new Error('ICE_SERVERS_JSON must be a JSON array of RTCIceServer objects')
  }
  return parsed
})()

// textbee (textbee.dev) delivers verification codes through an Android phone
// paired with the account. With no key set, codes are only logged — and
// echoed in the request-code response outside production (see below).
export const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY || null
// Which paired phone sends. Optional: textbee falls back to the default
// device, or the enabled one heard from most recently.
export const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID || null

/**
 * Whether the verification code is echoed in the request-code response, so
 * sign-in works in development with no SMS provider. On by default outside
 * production, and never on in production: echoing there would let anyone
 * sign in as any number. Asking for it in production is a misconfiguration,
 * so the process refuses to start rather than quietly run one way or the
 * other. (Nixpacks, which builds the Railway deploy, sets
 * NODE_ENV=production.)
 */
export function resolveAuthCodeEcho({ isProduction, requested }) {
  const asked = requested == null
    ? null
    : ['1', 'true'].includes(String(requested).trim().toLowerCase())
  if (isProduction && asked) {
    throw new Error(
      'AUTH_CODE_ECHO is set in production. Echoing sign-in codes lets anyone sign in ' +
      'as any number — unset it and configure TEXTBEE_API_KEY instead.'
    )
  }
  if (isProduction) return false
  return asked ?? true
}

export const AUTH_CODE_ECHO = resolveAuthCodeEcho({
  isProduction: IS_PRODUCTION,
  requested: process.env.AUTH_CODE_ECHO,
})
