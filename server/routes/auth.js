import {
  hashPassword, verifyPassword, normaliseEmail, checkPassword,
} from '../lib/password.js'
import { normaliseDisplayName, normaliseCoords } from '../lib/validate.js'
import { selfPlayer } from '../lib/serialize.js'
import {
  createPlayer, getPlayer, getPlayerByEmail, getPlayerWithSecret,
  attachCredentials, rankOf,
} from '../db/players.js'
import { createSession, destroySession } from '../db/sessions.js'

// Answering "no such email" separately from "wrong password" tells an
// attacker which addresses are registered. One message covers both.
const BAD_CREDENTIALS = 'That email and password do not match.'

export default function authRoutes(broadcastPlayers) {
  return async function routes(app) {
    /**
     * Create an account. If the caller is already playing as an account with
     * no credentials — someone who joined before sign-in existed — the email
     * and password attach to that account instead of starting a new one, so
     * their rating and duel history carry over.
     */
    app.post('/api/auth/register', async (request, reply) => {
      const email = normaliseEmail(request.body?.email)
      const password = request.body?.password
      const displayName = normaliseDisplayName(request.body?.displayName)

      if (!email) return reply.code(400).send({ error: 'Enter a valid email address.' })
      const passwordProblem = checkPassword(password)
      if (passwordProblem) return reply.code(400).send({ error: passwordProblem })
      if (!displayName) {
        return reply.code(400).send({ error: 'Pick a name between 2 and 24 characters.' })
      }
      if (getPlayerByEmail(email)) {
        return reply.code(409).send({ error: 'That email is already registered.' })
      }

      const coords = normaliseCoords(request.body?.lat, request.body?.lng)
      const passwordHash = await hashPassword(password)

      // Claim the anonymous account this device is already using, if any.
      const claimId = request.body?.claimPlayerId
      const claimable = claimId ? getPlayerWithSecret(claimId) : null
      let player
      if (claimable && !claimable.email) {
        player = attachCredentials(claimable.id, email, passwordHash)
        request.log.info({ playerId: player.id }, 'attached credentials to existing player')
      } else {
        player = createPlayer({
          displayName,
          email,
          passwordHash,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        })
        request.log.info({ playerId: player.id }, 'registered')
      }

      broadcastPlayers()
      return reply.code(201).send({
        token: createSession(player.id),
        player: selfPlayer(player, { rank: rankOf(player.id) }),
      })
    })

    /** Sign in on any device and pick up the same account. */
    app.post('/api/auth/login', async (request, reply) => {
      const email = normaliseEmail(request.body?.email)
      const password = request.body?.password
      if (!email || typeof password !== 'string') {
        return reply.code(400).send({ error: BAD_CREDENTIALS })
      }

      const row = getPlayerByEmail(email)
      const ok = row?.password_hash
        ? await verifyPassword(password, row.password_hash)
        : false
      if (!ok) return reply.code(401).send({ error: BAD_CREDENTIALS })

      const player = getPlayer(row.id)
      broadcastPlayers()
      return {
        token: createSession(player.id),
        player: selfPlayer(player, { rank: rankOf(player.id) }),
      }
    })

    app.post('/api/auth/logout', async (request) => {
      destroySession(request.headers.authorization?.replace(/^Bearer\s+/i, ''))
      return { ok: true }
    })
  }
}
