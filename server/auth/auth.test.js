import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The database module opens DATABASE_PATH at import, so point it at a
// throwaway file before anything imports it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gapped-auth-'))
process.env.DATABASE_PATH = path.join(tmp, 'auth.db')
delete process.env.AUTH_CODE_ECHO
delete process.env.NODE_ENV

const { default: Fastify } = await import('fastify')
const { db } = await import('../db/index.js')
const auth = await import('./index.js')

let app
const created = []

before(async () => {
  app = Fastify()
  await auth.registerAuth(app, {
    createPlayer: ({ displayName }) => {
      const name = typeof displayName === 'string' ? displayName.trim() : ''
      if (name.length < 2) return null
      const id = `p${created.length + 1}`
      db.prepare('INSERT INTO players (id, display_name, created_at) VALUES (?, ?, 0)').run(id, name)
      created.push(id)
      return id
    },
    describePlayer: (playerId) => ({ id: playerId, verifiedAs: auth.verifiedAs(playerId) }),
  })
  app.get('/whoami', async (request) => ({ playerId: auth.playerIdForRequest(request) }))
  await app.ready()
})

after(async () => {
  await app.close()
  db.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

const post = (url, payload, headers = {}, remoteAddress = '127.0.0.1') =>
  app.inject({ method: 'POST', url, payload, headers, remoteAddress })

async function codeFor(phone) {
  const res = await post('/api/auth/request-code', { phone })
  assert.equal(res.statusCode, 200, res.body)
  return res.json().devCode
}

test('a new number needs a name, then gets an account and a session', async () => {
  const phone = '+353871234567'
  const code = await codeFor(phone)

  const nameless = await post('/api/auth/verify', { phone, code })
  assert.equal(nameless.statusCode, 400)
  assert.equal(nameless.json().code, 'name_required')

  const signedUp = await post('/api/auth/verify', { phone, code, displayName: 'Rowan' })
  assert.equal(signedUp.statusCode, 201, signedUp.body)
  const { token, player } = signedUp.json()
  assert.equal(player.verifiedAs, phone)

  const me = await app.inject({ url: '/whoami', headers: { authorization: `Bearer ${token}` } })
  assert.equal(me.json().playerId, player.id)
})

test('the same number signs back into the same account', async () => {
  const phone = '+353871234567'
  const first = auth.verifiedAs('p1')
  assert.equal(first, phone)
  const code = await codeFor(phone)
  const again = await post('/api/auth/verify', { phone, code })
  assert.equal(again.statusCode, 200, again.body)
  assert.equal(again.json().player.id, 'p1')
})

test('a bare player id is not a credential', async () => {
  const res = await app.inject({ url: '/whoami', headers: { 'x-player-id': 'p1' } })
  assert.equal(res.json().playerId, null)
  assert.equal(auth.playerIdForToken('p1'), null)
})

test('signing out kills the token', async () => {
  const phone = '+353871234567'
  const code = await codeFor(phone)
  const { token } = (await post('/api/auth/verify', { phone, code })).json()
  assert.equal(auth.playerIdForToken(token), 'p1')
  await post('/api/auth/logout', {}, { authorization: `Bearer ${token}` })
  assert.equal(auth.playerIdForToken(token), null)
})

test('a refused name creates nothing', async () => {
  const phone = '+14155550123'
  const code = await codeFor(phone)
  const before = created.length
  const res = await post('/api/auth/verify', { phone, code, displayName: 'x' })
  assert.equal(res.statusCode, 400)
  assert.equal(created.length, before)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_identities WHERE subject = ?').get(phone).n, 0)
})

test('bearer parsing is strict', () => {
  const req = (authorization) => ({ headers: { authorization } })
  assert.equal(auth.bearerToken(req('Bearer abc')), 'abc')
  assert.equal(auth.bearerToken(req('bearer  abc ')), 'abc')
  assert.equal(auth.bearerToken(req('Basic abc')), null)
  assert.equal(auth.bearerToken(req('Bearer a b')), null)
  assert.equal(auth.bearerToken({ headers: {} }), null)
})

test('an hourly purge does not reset a number’s code quota', async () => {
  const phone = '+14155550177'
  const issued = []
  for (let i = 0; i < 5; i++) {
    const res = await post('/api/auth/request-code', { phone }, {}, `10.0.1.${i}`)
    assert.equal(res.statusCode, 200, res.body)
    issued.push(res.json())
    // Step past the resend cooldown without waiting.
    db.prepare('UPDATE auth_codes SET created_at = created_at - 60000, expires_at = 0 WHERE phone = ?').run(phone)
  }
  auth.purgeExpired()
  const sixth = await post('/api/auth/request-code', { phone }, {}, '10.0.1.9')
  assert.equal(sixth.statusCode, 429)
  assert.ok(sixth.json().retryInSeconds < 3600)
})

test('one caller cannot work through many numbers', async () => {
  let last
  for (let i = 0; i < 11; i++) {
    last = await post('/api/auth/request-code', { phone: `+1415555${String(200 + i).padStart(4, '0')}` }, {}, '10.0.2.1')
  }
  assert.equal(last.statusCode, 429)
  assert.equal(last.json().code, 'rate_limited')
  // Someone else is not held up by it.
  assert.equal((await post('/api/auth/request-code', { phone: '+14155550299' }, {}, '10.0.2.2')).statusCode, 200)
})
