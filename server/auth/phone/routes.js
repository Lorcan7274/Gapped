import { db } from '../../db/index.js'
import { AUTH_CODE_ECHO } from '../../config/env.js'
import { normalisePhone } from './numbers.js'
import { sendCode } from './sms.js'
import { issueCode, checkCode, consumeCodes } from './codes.js'
import { createSession } from '../sessions.js'
import { playerIdFor, linkIdentity } from '../identities.js'

const PROVIDER = 'phone'
const isConstraint = (error) => String(error?.code || '').startsWith('SQLITE_CONSTRAINT')

/**
 * Sign-in by phone: a texted six-digit code proves the number, and the number
 * picks the account. The hooks come from auth/index.js — this provider never
 * reaches into game tables itself.
 */
export default function phoneRoutes({ createPlayer, describePlayer, onPlayerCreated }) {
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
        // Development only: the code rides back in the response so sign-in
        // works with no SMS provider. config/env.js keeps this off in
        // production.
        ...(AUTH_CODE_ECHO ? { devCode: issued.code } : {}),
      }
    })

    /**
     * Step two: the code proves the number. An account already linked to it
     * signs in; otherwise a new account is created, which needs a name.
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

      const signIn = (playerId, statusCode = 200) => {
        consumeCodes(phone)
        return reply.code(statusCode).send({
          token: createSession(playerId),
          player: describePlayer(playerId),
        })
      }

      const existing = playerIdFor(PROVIDER, phone)
      if (existing) {
        request.log.info({ playerId: existing }, 'signed in by phone')
        return signIn(existing)
      }

      // The player and its identity are created together: if another verify
      // for the same number wins the race, this one rolls back whole and
      // signs into the winner instead.
      let created
      try {
        created = db.transaction(() => {
          const playerId = createPlayer({ displayName: request.body?.displayName })
          if (!playerId) return null
          linkIdentity(PROVIDER, phone, playerId)
          return playerId
        })()
      } catch (error) {
        const winner = isConstraint(error) ? playerIdFor(PROVIDER, phone) : null
        if (winner) return signIn(winner)
        throw error
      }

      // The code is deliberately not consumed on this refusal, so adding a
      // name and resubmitting the same code succeeds.
      if (!created) {
        return reply.code(400).send({
          error: 'No account uses that number yet. Pick a name to create one.',
          code: 'name_required',
        })
      }

      request.log.info({ playerId: created }, 'registered by phone')
      onPlayerCreated?.(created)
      return signIn(created, 201)
    })
  }
}
