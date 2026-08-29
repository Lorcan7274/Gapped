const PLAYER_KEY = 'gap.player'
const TOKEN_KEY = 'gap.token'

/** The joined player, kept in localStorage so a reload skips the join screen. */
export function readPlayer() {
  try {
    const raw = localStorage.getItem(PLAYER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.id === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function writePlayer(player) {
  try {
    if (player) localStorage.setItem(PLAYER_KEY, JSON.stringify(player))
    else localStorage.removeItem(PLAYER_KEY)
  } catch {
    /* private mode — the session just will not survive a reload */
  }
}

export function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode — the session just will not survive a reload */
  }
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
  /** The stored id is dead; the caller should clear it and re-join. */
  get isUnknownPlayer() {
    return this.status === 404 && this.code === 'unknown_player'
  }
}

// Same origin as the frontend, so relative URLs are all we need.
export async function api(path, { method = 'GET', body, playerId, token } = {}) {
  // Prefer the session token; the player id is only still sent so accounts
  // created before sign-in existed keep working.
  const bearer = token ?? readToken()
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(playerId ? { 'x-player-id': playerId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(payload.error || `Request failed (${res.status})`, res.status, payload.code)
  }
  return payload
}
