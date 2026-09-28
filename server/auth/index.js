import { sessionPlayerId, destroySession, purgeExpiredSessions } from './sessions.js'
import { identitiesOf } from './identities.js'
import { purgeExpiredAuthCodes } from './phone/codes.js'
import phoneRoutes from './phone/routes.js'

/**
 * The seam between signing in and the game. Game code imports this file and
 * nothing else under auth/; auth imports nothing from the game. Everything
 * crossing the seam is a player id, plus three hooks the game hands over at
 * registration:
 *
 *   createPlayer({ displayName })  -> new player id, or null if the name is
 *                                     not acceptable. Must be synchronous: it
 *                                     runs inside the transaction that links
 *                                     the new identity, so a lost race leaves
 *                                     no orphan player behind.
 *   describePlayer(playerId)       -> the signed-in player as the client sees it
 *   onPlayerCreated(playerId)      -> optional notification
 *
 * Today's provider is phone + texted code (auth/phone). Replacing it, or
 * adding OAuth next to it, means a new provider directory registering its
 * own routes and linking identities — no game code changes.
 */

/** The opaque session token from `Authorization: Bearer …`, or null. */
export function bearerToken(request) {
  const header = request.headers?.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/** The player a session token belongs to, or null when it is unknown or expired. */
export const playerIdForToken = (token) => sessionPlayerId(token)

export const playerIdForRequest = (request) => sessionPlayerId(bearerToken(request))

/**
 * How the account proved itself, for showing the player on their own
 * profile ("Verified as +353 …"). Never serialise this for anyone else.
 */
export function verifiedAs(playerId) {
  const phone = identitiesOf(playerId).find((identity) => identity.provider === 'phone')
  return phone?.subject ?? null
}

export async function registerAuth(app, hooks) {
  if (typeof hooks?.createPlayer !== 'function' || typeof hooks?.describePlayer !== 'function') {
    throw new Error('registerAuth needs createPlayer and describePlayer hooks')
  }
  await app.register(phoneRoutes(hooks))

  // Signing out is the same for every provider: the session token dies.
  app.post('/api/auth/logout', async (request) => {
    destroySession(bearerToken(request))
    return { ok: true }
  })
}

/** Housekeeping: drop expired sessions and sign-in codes. */
export function purgeExpired() {
  purgeExpiredSessions()
  purgeExpiredAuthCodes()
}
