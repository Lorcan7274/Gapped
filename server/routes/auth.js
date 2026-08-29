import { AUTH_CODE_TTL_MS, IS_PRODUCTION } from '../config.js'
import { newAuthCode, safeEqual } from '../lib/ids.js'
import { normalisePhone, normaliseHandle, suggestHandle } from '../lib/validate.js'
import { selfPlayer } from '../lib/serialize.js'
import {
  putAuthCode,
  getAuthCode,
  recordCodeAttempt,
  clearAuthCode,
  createSession,
  destroySession,
} from '../db/auth.js'
import {
  getPlayerByPhone,
  getPlayer,
  createPlayer,
  handleTaken,
  renamePlayer,
  rankOf,
} from '../db/players.js'

const MAX_CODE_ATTEMPTS = 5

export default async function authRoutes(app) {
  // Step one: ask for a code. Always answers 200 so the endpoint cannot be
  // used to enumerate which phone numbers are registered.
  app.post('/api/auth/request-code', async (request, reply) => {
    const phone = normalisePhone(request.body?.phone)
    if (!phone) {
      return reply.code(400).send({ error: 'A valid phone number is required.' })
    }

    const code = newAuthCode()
    putAuthCode(phone, code, AUTH_CODE_TTL_MS)
    request.log.info({ phone }, 'issued verification code')

    // Until an SMS provider is wired up, non-production returns the code so
    // the flow is usable end to end.
    return {
      ok: true,
      expiresInMs: AUTH_CODE_TTL_MS,
      ...(IS_PRODUCTION ? {} : { devCode: code }),
    }
  })

  // Step two: exchange the code for a session. Creates the player on first use.
  app.post('/api/auth/verify', async (request, reply) => {
    const phone = normalisePhone(request.body?.phone)
    const code = String(request.body?.code ?? '').trim()
    if (!phone || !code) {
      return reply.code(400).send({ error: 'Phone and code are required.' })
    }

    const record = getAuthCode(phone)
    if (!record || record.expires_at < Date.now()) {
      clearAuthCode(phone)
      return reply.code(400).send({ error: 'That code has expired. Request a new one.' })
    }
    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      clearAuthCode(phone)
      return reply.code(429).send({ error: 'Too many attempts. Request a new code.' })
    }
    if (!safeEqual(record.code, code)) {
      recordCodeAttempt(phone)
      return reply.code(400).send({ error: 'That code is not right.' })
    }

    clearAuthCode(phone)

    let player = getPlayerByPhone(phone)
    let isNew = false
    if (!player) {
      let handle = suggestHandle(phone)
      while (handleTaken(handle)) handle = suggestHandle(phone)
      player = createPlayer({ phone, handle })
      isNew = true
    } else {
      player = getPlayer(player.id)
    }

    const token = createSession(player.id)
    return {
      token,
      isNew,
      player: selfPlayer(player, { rank: rankOf(player.id) }),
    }
  })

  app.post('/api/auth/logout', async (request) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (token) destroySession(token)
    return { ok: true }
  })

  // Change your display name. Handles are unique, case-insensitively.
  app.patch('/api/me/handle', { preHandler: app.requireAuth }, async (request, reply) => {
    const handle = normaliseHandle(request.body?.handle)
    if (!handle) {
      return reply
        .code(400)
        .send({ error: 'Handles are 3-16 characters: letters, numbers, underscore.' })
    }
    if (handle.toLowerCase() !== request.player.handle.toLowerCase() && handleTaken(handle)) {
      return reply.code(409).send({ error: 'That handle is taken.' })
    }
    const updated = renamePlayer(request.player.id, handle)
    return { player: selfPlayer(updated, { rank: rankOf(updated.id) }) }
  })
}
