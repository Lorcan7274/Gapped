import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gapped-runs-'))
process.env.DATABASE_PATH = path.join(tmp, 'runs.db')
delete process.env.AUTH_CODE_ECHO
delete process.env.NODE_ENV

const { buildApp } = await import('../app.js')
const { db } = await import('../db/index.js')
const { SHARDS } = await import('../config/game.js')

let app
let token
let firstRun
const LAT = 53.34
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180)

/** A straight run east: one fix a second at `speed` m/s, ending `endAgoMs` ago. */
function track({ seconds = 1800, speed = 3, endAgoMs = 60_000 } = {}) {
  const start = Date.now() - endAgoMs - seconds * 1000
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    t: start + i * 1000, lat: LAT, lng: -6.26 + (i * speed) / M_PER_DEG_LNG, acc: 5,
  }))
}

const call = (method, url, payload) =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } })

before(async () => {
  app = await buildApp()
  const phone = '+353870000009'
  const { devCode } = (await app.inject({ method: 'POST', url: '/api/auth/request-code', payload: { phone } })).json()
  const signed = await app.inject({
    method: 'POST', url: '/api/auth/verify', payload: { phone, code: devCode, displayName: 'Rowan' },
  })
  token = signed.json().token
})

after(async () => {
  await app.close()
  db.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('a signed-in player starts with nothing and no hidden rating on the wire', async () => {
  const { player } = (await call('GET', '/api/me')).json()
  assert.equal(player.shards, 0)
  assert.equal(player.fuel, 0)
  assert.equal(player.weekPoints, 0)
  assert.equal(player.tier.key, 'bronze')
  const wire = JSON.stringify(player)
  for (const leak of ['mmr', 'rating', 'intensity']) assert.ok(!wire.includes(leak), leak)
})

test('a solo run is measured by the server and pays out', async () => {
  firstRun = track()
  const res = await call('POST', '/api/runs', { track: firstRun, private: false })
  assert.equal(res.statusCode, 201, res.body)
  const { run, player } = res.json()
  assert.ok(Math.abs(run.distanceM - 5400) < 10, run.distanceM)
  assert.equal(run.elapsedMs, 1_800_000)
  assert.equal(run.status, 'ok')
  assert.ok(run.shards > 0 && run.fuel > 0 && run.points > 0)
  assert.equal(player.shards, run.shards)
  assert.equal(player.fuel, run.fuel)
  assert.equal(player.weekPoints, run.points)
  assert.equal(player.streak, 1)
  assert.equal(player.runs, 1)
  assert.ok(!JSON.stringify(run).includes('intensity'))
})

test('uploading the same run twice pays once', async () => {
  const again = await call('POST', '/api/runs', { track: firstRun })
  assert.equal(again.statusCode, 200)
  assert.equal(again.json().duplicate, true)
  assert.equal(again.json().player.runs, 1)
})

test('a short jog is kept but pays nothing', async () => {
  const res = await call('POST', '/api/runs', { track: track({ seconds: 240, endAgoMs: 7_200_000 }) })
  assert.equal(res.statusCode, 201)
  assert.equal(res.json().run.shards, 0)
})

test('an implausible run is quarantined: stored, unranked, paying nothing, taking nothing', async () => {
  const before = (await call('GET', '/api/me')).json().player
  const res = await call('POST', '/api/runs', { track: track({ speed: 9.5, endAgoMs: 10_800_000 }) })
  assert.equal(res.statusCode, 201)
  const { run, player } = res.json()
  assert.equal(run.status, 'quarantined')
  assert.deepEqual([run.shards, run.fuel, run.points], [0, 0, 0])
  assert.equal(player.shards, before.shards)
  assert.equal(player.lifetimeM, before.lifetimeM)
})

test('daily caps hold across runs', async () => {
  for (let i = 0; i < 6; i++) {
    const res = await call('POST', '/api/runs', {
      track: track({ seconds: 3600, endAgoMs: 12_000_000 + i * 3_700_000 }),
    })
    assert.equal(res.statusCode, 201)
  }
  const days = db.prepare('SELECT day, SUM(shards) AS shards FROM runs GROUP BY day').all()
  for (const { day, shards } of days) assert.ok(shards <= SHARDS.dailyCap, `${day}: ${shards}`)
  assert.ok(days.some((d) => d.shards === SHARDS.dailyCap), 'six hour-long runs reach the cap')
})

test('malformed tracks are refused with a reason', async () => {
  const res = await call('POST', '/api/runs', { track: [{ t: 1, lat: 0, lng: 0 }] })
  assert.equal(res.statusCode, 400)
  assert.equal(res.json().code, 'track_short')
})

test('runs need a session', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/runs', payload: { track: track() } })
  assert.equal(res.statusCode, 404)
})

test('the stored track can be read back for replay', () => {
  const row = db.prepare('SELECT samples, data FROM run_tracks LIMIT 1').get()
  assert.ok(row.samples > 1000)
  assert.equal(JSON.parse(row.data).v, 1)
})
