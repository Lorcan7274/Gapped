import { normalisePhone } from '../lib/phone.js'
import { sendCode } from '../lib/sms.js'
import { AUTH_CODE_ECHO } from '../config.js'
import { normaliseDisplayName, normaliseCoords } from '../lib/validate.js'
import { selfPlayer } from '../lib/serialize.js'
import {
  createPlayer, getPlayer, getPlayerByPhone, attachPhone, hasPhone, rankOf,
} from '../db/players.js'
import { issueCode, checkCode, consumeCodes } from '../db/authCodes.js'
import { createSession, destroySession } from '../db/sessions.js'

export default function authRoutes(broadcastPlayers) {
  return async function routes(app) {
    /**
     * Step one: ask for a code. The same endpoint serves signing up and
     * signing back in — it neither knows nor says whether the number has an
     * account, so it cannot be used to enumerate who plays.
     */
    app.post('/api/auth/request-code', async (request, reply) => {
      const phone = normalisePhone(request.body?.phone)
      if (!phone) {
        return reply.code(400).send({
          error: 'Enter a phone number with its country code, like +353 87 123 4567.',
        })
      }

      const issued = issueCode(phone)
      if (!issued.ok) {
        return reply.code(429).send({
          error: issued.reason === 'cooldown'
            ? `Give it ${issued.retryInSeconds} seconds before asking for another code.`
            : 'Too many codes for this number. Try again in an hour.',
          retryInSeconds: issued.retryInSeconds,
        })
      }

      try {
        await sendCode(phone, issued.code, request.log)
      } catch (error) {
        request.log.error({ err: error }, 'verification SMS failed to send')
        return reply.code(502).send({
          error: 'We could not text that number right now. Wait a moment and try again.',
        })
      }
      return {
        ok: true,
        ttlSeconds: Math.round(issued.ttlMs / 1000),
        // No SMS provider is wired, so outside production the code rides
        // back in the response to keep the flow usable. See lib/sms.js.
        ...(AUTH_CODE_ECHO ? { devCode: issued.code } : {}),
      }
    })

    /**
     * Step two: the code proves the number, and the number picks the
     * account. In order: an account already owning it signs in; otherwise
     * the anonymous account this device is playing as claims it; otherwise
     * a new account is created, which needs a display name.
     */
    app.post('/api/auth/verify', async (request, reply) => {
      const phone = normalisePhone(request.body?.phone)
      const code = String(request.body?.code ?? '').trim()
      if (!phone) {
        return reply.code(400).send({ error: 'Enter a phone number with its country code.' })
      }
      if (!/^\d{6}$/.test(code)) {
        return reply.code(400).send({ error: 'Enter the six-digit code.' })
      }

      const verdict = checkCode(phone, code)
      if (verdict.status === 'too_many') {
        return reply.code(429).send({
          error: 'Too many wrong guesses. Ask for a fresh code.',
          code: 'code_locked',
        })
      }
      if (verdict.status === 'expired') {
        return reply.code(401).send({
          error: 'That code has expired. Ask for a fresh one.',
          code: 'code_expired',
        })
      }
      if (verdict.status !== 'ok') {
        return reply.code(401).send({
          error: 'That code is not right. Use the newest text we sent you.',
          code: 'code_invalid',
        })
      }

      const signIn = (player, statusCode = 200) => {
        consumeCodes(phone)
        return reply.code(statusCode).send({
          token: createSession(player.id),
          player: selfPlayer(player, { rank: rankOf(player.id) }),
        })
      }

      const existing = getPlayerByPhone(phone)
      if (existing) {
        request.log.info({ playerId: existing.id }, 'signed in by phone')
        return signIn(existing)
      }

      const claimId = request.body?.claimPlayerId
      const claimable = claimId ? getPlayer(claimId) : null
      if (claimable && !hasPhone(claimable.id)) {
        try {
          attachPhone(claimable.id, phone)
        } catch (error) {
          // Raced by another verify for the same number; that one owns it.
          if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
            const winner = getPlayerByPhone(phone)
            if (winner) return signIn(winner)
          }
          throw error
        }
        request.log.info({ playerId: claimable.id }, 'attached phone to existing player')
        broadcastPlayers()
        return signIn(getPlayer(claimable.id))
      }

      // The code is deliberately not consumed on this refusal, so adding a
      // name and resubmitting the same code succeeds.
      const displayName = normaliseDisplayName(request.body?.displayName)
      if (!displayName) {
        return reply.code(400).send({
          error: 'No account uses that number yet. Pick a name to create one.',
          code: 'name_required',
        })
      }

      const coords = normaliseCoords(request.body?.lat, request.body?.lng)
      let player
      try {
        player = createPlayer({
          displayName,
          phone,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        })
      } catch (error) {
        if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
          const winner = getPlayerByPhone(phone)
          if (winner) return signIn(winner)
        }
        throw error
      }
      request.log.info({ playerId: player.id }, 'registered by phone')
      broadcastPlayers()
      return signIn(player, 201)
    })

    app.post('/api/auth/logout', async (request) => {
      destroySession(request.headers.authorization?.replace(/^Bearer\s+/i, ''))
      return { ok: true }
    })
  }
}
