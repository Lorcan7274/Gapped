import { test, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gapped-duels-'))
process.env.DATABASE_PATH = path.join(tmp, 'duels.db')
delete process.env.AUTH_CODE_ECHO
delete process.env.NODE_ENV

const { buildApp } = await import('../app.js')
const { db } = await import('../db/index.js')
const { settleDue } = await import('../db/duels.js')
const { DUEL, DUEL_POINTS } = await import('../config/game.js')
const { weekOf } = await import('../lib/economy.js')

let app
const tokens = {}
const ids = {}
const LAT = 53.34
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180)
const WEEK_MS = 7 * 86_400_000

/** A straight run east, one fix a second at `speed` m/s, ending `endAgoMs` ago. */
function track({ seconds = 1800, speed = 3, endAgoMs = 60_000 } = {}) {
  const start = Date.now() - endAgoMs - seconds * 1000
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    t: start + i * 1000, lat: LAT, lng: -6.26 + (i * speed) / M_PER_DEG_LNG, acc: 5,
  }))
}

const as = (who) => (method, url, payload) =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${tokens[who]}` } })

const giveFuel = (who, fuel) => db.prepare('UPDATE players SET fuel = ? WHERE id = ?').run(fuel, ids[who])
const mmr = (who) => db.prepare('SELECT mmr FROM players WHERE id = ?').get(ids[who]).mmr
const duelRow = (id) => db.prepare('SELECT * FROM duels WHERE id = ?').get(id)
/**
 * The leg began just before the run did: tests cannot wait half an hour for
 * real. `opts` are the track() options of the run that follows.
 */
const backdate = (duelId, leg, { seconds = 1800, endAgoMs = 60_000 } = {}) =>
  db.prepare(`UPDATE duels SET leg${leg}_started_at = ? WHERE id = ?`)
    .run(Date.now() - endAgoMs - seconds * 1000 - 1000, duelId)

async function signUp(who, phone) {
  const { devCode } = (await app.inject({ method: 'POST', url: '/api/auth/request-code', payload: { phone } })).json()
  const res = await app.inject({
    method: 'POST', url: '/api/auth/verify', payload: { phone, code: devCode, displayName: who },
  })
  tokens[who] = res.json().token
  ids[who] = res.json().player.id
}

let fionnRun
let duelId

before(async () => {
  app = await buildApp()
  await signUp('Rowan', '+353870000011')
  await signUp('Fionn', '+353870000012')
  await signUp('Aoife', '+353870000013')
})

after(async () => {
  await app.close()
  db.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('the feed offers other players’ public runs, and only those', async () => {
  const pub = await as('Fionn')('POST', '/api/runs', { track: track({ endAgoMs: 4 * 3_600_000 }) })
  fionnRun = pub.json().run
  await as('Fionn')('POST', '/api/runs', { track: track({ endAgoMs: 6 * 3_600_000 }), private: true })
  await as('Fionn')('POST', '/api/runs', { track: track({ seconds: 200, endAgoMs: 8 * 3_600_000 }) }) // 600 m
  await as('Rowan')('POST', '/api/runs', { track: track({ endAgoMs: 10 * 3_600_000 }) })

  const { runs, fuelCost } = (await as('Rowan')('GET', '/api/feed')).json()
  assert.equal(fuelCost, DUEL.fuelCost)
  assert.deepEqual(runs.map((r) => r.id), [fionnRun.id])
  assert.equal(runs[0].player.displayName, 'Fionn')
  assert.ok(Math.abs(runs[0].timeMs - 1_800_000) < 2000, runs[0].timeMs)
  assert.ok(!JSON.stringify(runs).includes('mmr'))
})

test('a duel costs Fuel up front', async () => {
  giveFuel('Rowan', DUEL.fuelCost - 1)
  const res = await as('Rowan')('POST', '/api/duels', { runId: fionnRun.id })
  assert.equal(res.statusCode, 402)
  assert.equal(res.json().code, 'fuel_short')
})

test('you cannot race your own run or a private one', async () => {
  giveFuel('Fionn', 100)
  assert.equal((await as('Fionn')('POST', '/api/duels', { runId: fionnRun.id })).statusCode, 404)
  const priv = db.prepare("SELECT id FROM runs WHERE player_id = ? AND private = 1").get(ids.Fionn)
  assert.equal((await as('Rowan')('POST', '/api/duels', { runId: priv.id })).statusCode, 404)
})

test('challenging hands back a ghost: distance over time, never a location', async () => {
  giveFuel('Rowan', 25)
  const res = await as('Rowan')('POST', '/api/duels', { runId: fionnRun.id })
  assert.equal(res.statusCode, 201, res.body)
  const { duel, ghost, player } = res.json()
  duelId = duel.id
  assert.equal(player.fuel, 25 - DUEL.fuelCost)
  assert.equal(duel.status, 'leg1')
  assert.equal(duel.role, 'challenger')
  assert.equal(duel.opponent.displayName, 'Fionn')
  assert.ok(Math.abs(ghost.distanceM - 5400) < 10)
  assert.equal(ghost.profile.at(-1)[1], Math.round(ghost.distanceM * 10) / 10)
  assert.ok(ghost.profile.every((p) => p.length === 2))
  assert.ok(!/lat|lng/.test(JSON.stringify(ghost)))

  const again = await as('Rowan')('POST', '/api/duels', { runId: fionnRun.id })
  assert.equal(again.statusCode, 409)
})

test('an old run cannot be passed off as a leg: it counts as solo', async () => {
  const old = track({ endAgoMs: 2 * 3_600_000 })
  const res = await as('Rowan')('POST', '/api/runs', { track: old, duelId })
  assert.equal(res.statusCode, 201)
  assert.equal(res.json().run.kind, 'solo')
  assert.equal(res.json().duelClosed, true)
  assert.equal(duelRow(duelId).status, 'leg1')

  // Sent again, it still says so, and never hands back the open duel.
  const again = (await as('Rowan')('POST', '/api/runs', { track: old, duelId })).json()
  assert.equal(again.duplicate, true)
  assert.equal(again.duelClosed, true)
  assert.equal(again.duel, null)
})

test('leg one in: the challenge goes to the target, points wait for the result', async () => {
  backdate(duelId, 1)
  const res = await as('Rowan')('POST', '/api/runs', { track: track({ speed: 3.2 }), duelId })
  assert.equal(res.statusCode, 201, res.body)
  const { run, duel } = res.json()
  assert.equal(run.kind, 'duel')
  assert.equal(run.points, 0)
  assert.ok(run.shards > 0, 'a leg still grows the crystal')
  assert.equal(duel.status, 'awaiting')
  assert.ok(Math.abs(duel.legs.challenger.ms - 5400 / 3.2 * 1000) < 2000, duel.legs.challenger.ms)

  const theirs = (await as('Fionn')('GET', '/api/duels')).json().duels
  assert.equal(theirs.length, 1)
  assert.equal(theirs[0].yourTurn, true)
  assert.equal(theirs[0].role, 'target')
  const mine = (await as('Rowan')('GET', '/api/duels')).json().duels
  assert.equal(mine[0].yourTurn, false)
})

test('only the target can reply, and the reply races the challenger’s run', async () => {
  assert.equal((await as('Aoife')('POST', `/api/duels/${duelId}/reply`)).statusCode, 404)
  const res = await as('Fionn')('POST', `/api/duels/${duelId}/reply`)
  assert.equal(res.statusCode, 200, res.body)
  const { duel, ghost } = res.json()
  assert.equal(duel.status, 'leg2')
  assert.equal(ghost.timeMs, duel.legs.challenger.ms)
  assert.ok(Math.abs(ghost.profile.at(-1)[0] - ghost.timeMs) < 2, JSON.stringify([ghost.profile.at(-1), ghost.profile.at(-2), ghost.timeMs, ghost.distanceM]))
})

test('the reply settles the duel on the combined margin', async () => {
  backdate(duelId, 2)
  const before = { rowan: mmr('Rowan'), fionn: mmr('Fionn') }
  const res = await as('Fionn')('POST', '/api/runs', { track: track({ speed: 3.1 }), duelId })
  assert.equal(res.statusCode, 201, res.body)
  const { duel, player } = res.json()
  assert.equal(duel.status, 'settled')
  assert.equal(duel.result.outcome, 'challenger')
  assert.equal(duel.result.you, 'lost')
  assert.ok(duel.result.marginMs < 0, 'from Fionn’s side the margin is behind')
  assert.ok(duel.result.points >= 0, 'losing a duel never costs points')

  const rowan = (await as('Rowan')('GET', `/api/duels/${duelId}`)).json().duel
  assert.equal(rowan.result.you, 'won')
  assert.ok(rowan.result.points >= DUEL_POINTS.base * DUEL_POINTS.minMultiplier)
  assert.equal(rowan.result.marginMs, -duel.result.marginMs)
  const me = (await as('Rowan')('GET', '/api/me')).json().player
  assert.ok(me.weekPoints >= rowan.result.points)
  assert.ok(mmr('Rowan') >= before.rowan, 'the winner never loses rating')
  assert.notEqual(mmr('Fionn'), before.fionn)
  for (const leak of ['mmr', 'rating']) {
    assert.ok(!JSON.stringify(rowan).includes(leak), leak)
    assert.ok(!JSON.stringify(player).includes(leak), leak)
  }
})

test('a settled duel takes no more legs', async () => {
  const res = await as('Fionn')('POST', '/api/runs', { track: track({ speed: 3.3, endAgoMs: 30_000 }), duelId })
  assert.equal(res.json().run.kind, 'solo')
  assert.equal(res.json().duelClosed, true)
})

test('quitting leg one withdraws: no points, and it never gains rating', async () => {
  const aoifeRun = (await as('Aoife')('POST', '/api/runs', { track: track({ endAgoMs: 5 * 3_600_000 }) })).json().run
  giveFuel('Rowan', 50)
  const { duel } = (await as('Rowan')('POST', '/api/duels', { runId: aoifeRun.id })).json()
  backdate(duel.id, 1, { seconds: 600, endAgoMs: 20_000 })
  const before = mmr('Rowan')
  const res = await as('Rowan')('POST', '/api/runs', {
    track: track({ seconds: 600, endAgoMs: 20_000 }), duelId: duel.id, quit: true,
  })
  const settled = res.json().duel
  assert.equal(settled.status, 'settled')
  assert.equal(settled.result.outcome, 'withdrawn')
  assert.equal(settled.result.you, 'quit')
  assert.equal(settled.result.points, 0)
  assert.ok(mmr('Rowan') <= before)
})

test('starting a new duel walks away from a leg left running', async () => {
  const aoifeRun = db.prepare("SELECT id FROM runs WHERE player_id = ? AND kind = 'solo'").get(ids.Aoife)
  giveFuel('Fionn', 50)
  const first = (await as('Fionn')('POST', '/api/duels', { runId: aoifeRun.id })).json().duel
  const rowanRun = db.prepare("SELECT id FROM runs WHERE player_id = ? AND kind = 'solo' AND private = 0 ORDER BY started_at LIMIT 1").get(ids.Rowan)
  const second = await as('Fionn')('POST', '/api/duels', { runId: rowanRun.id })
  assert.equal(second.statusCode, 201, second.body)
  const abandoned = duelRow(first.id)
  assert.equal(abandoned.status, 'settled')
  assert.equal(abandoned.outcome, 'withdrawn')
})


test('Sunday night: an ignored challenge is a walkover, a reply left running is a quit', async () => {
  // Fionn's open duel against Rowan: leg one in, then Rowan ignores it.
  const open = db.prepare("SELECT id FROM duels WHERE challenger_id = ? AND status = 'leg1'").get(ids.Fionn)
  backdate(open.id, 1, { endAgoMs: 10_000 })
  await as('Fionn')('POST', '/api/runs', { track: track({ speed: 3, endAgoMs: 10_000 }), duelId: open.id })
  assert.equal(duelRow(open.id).status, 'awaiting')

  // Aoife challenges Fionn; Fionn starts a reply and never finishes it.
  giveFuel('Aoife', 50)
  const fionnSolo = db.prepare("SELECT id FROM runs WHERE player_id = ? AND kind = 'solo' AND private = 0 AND distance_m > 1000 ORDER BY started_at DESC LIMIT 1").get(ids.Fionn)
  const second = (await as('Aoife')('POST', '/api/duels', { runId: fionnSolo.id })).json().duel
  backdate(second.id, 1, { endAgoMs: 5_000 })
  await as('Aoife')('POST', '/api/runs', { track: track({ speed: 3.4, endAgoMs: 5_000 }), duelId: second.id })
  const replied = await as('Fionn')('POST', `/api/duels/${second.id}/reply`)
  assert.equal(replied.statusCode, 200, replied.body + JSON.stringify(duelRow(second.id)))

  const week = duelRow(open.id).week
  const before = (who) => db.prepare('SELECT COALESCE(SUM(points),0) AS p FROM point_events WHERE player_id = ? AND week = ?').get(ids[who], week).p
  const rowanBefore = before('Rowan')
  const fionnBefore = before('Fionn')

  assert.equal(settleDue(Date.now()), 0, 'nothing settles mid-week')
  // Past the grace a leg still running gets, so the unfinished reply settles too.
  const nextWeek = Date.now() + WEEK_MS + DUEL.legGraceMs
  assert.ok(weekOf(nextWeek) > week)
  assert.ok(settleDue(nextWeek) >= 2)
  assert.equal(settleDue(nextWeek), 0, 'settling twice changes nothing')

  const walkover = duelRow(open.id)
  assert.equal(walkover.outcome, 'walkover')
  assert.equal(before('Fionn') - fionnBefore >= DUEL_POINTS.walkoverSteal, true)
  assert.equal(before('Rowan') - rowanBefore, -DUEL_POINTS.walkoverSteal)
  assert.equal(walkover.challenger_mmr_delta, 0)

  const quit = duelRow(second.id)
  assert.equal(quit.status, 'settled')
  assert.equal(quit.leg2_ms, null)
  assert.ok(['challenger', 'tie', 'target'].includes(quit.outcome))
  assert.ok(quit.target_mmr_delta <= 0, 'a quitter never gains')
})

test('a flagged leg counts as a quit: never better than quitting, and the Fuel stays spent', async () => {
  giveFuel('Aoife', 30)
  const rowanRun = db.prepare("SELECT id FROM runs WHERE player_id = ? AND kind = 'solo' AND private = 0 ORDER BY started_at LIMIT 1").get(ids.Rowan)
  const { duel } = (await as('Aoife')('POST', '/api/duels', { runId: rowanRun.id })).json()
  assert.equal(db.prepare('SELECT fuel FROM players WHERE id = ?').get(ids.Aoife).fuel, 30 - DUEL.fuelCost)
  backdate(duel.id, 1, { seconds: 900, endAgoMs: 1_000 })
  const before = mmr('Aoife')
  const res = await as('Aoife')('POST', '/api/runs', { track: track({ seconds: 900, speed: 8, endAgoMs: 1_000 }), duelId: duel.id })
  assert.equal(res.json().run.status, 'quarantined')
  assert.equal(res.json().run.kind, 'duel')
  assert.equal(res.json().duel.status, 'settled')
  assert.equal(res.json().duel.result.outcome, 'withdrawn')
  assert.equal(res.json().duel.result.points, 0)
  assert.equal(res.json().player.fuel, 30 - DUEL.fuelCost, 'no refund')
  assert.ok(mmr('Aoife') <= before, 'a flagged leg never gains rating')
  assert.ok(!JSON.stringify(res.json()).includes('flag'), 'quiet: no labels')
})

test('a run is raced once, and only while the feed would offer it', async () => {
  giveFuel('Rowan', 50)
  const raced = await as('Rowan')('POST', '/api/duels', { runId: fionnRun.id })
  assert.equal(raced.statusCode, 409)
  assert.equal(raced.json().code, 'run_raced')

  const stale = (await as('Fionn')('POST', '/api/runs', { track: track({ endAgoMs: 20 * 3_600_000 }) })).json().run
  db.prepare('UPDATE runs SET started_at = ? WHERE id = ?').run(Date.now() - (DUEL.feedDays + 1) * 86_400_000, stale.id)
  const old = await as('Rowan')('POST', '/api/duels', { runId: stale.id })
  assert.equal(old.statusCode, 400)
  assert.equal(old.json().code, 'run_stale')
  assert.equal(db.prepare('SELECT fuel FROM players WHERE id = ?').get(ids.Rowan).fuel, 50, 'refused before paying')
})

/** The first minute of the week after the one `ts` falls in. */
function nextWeekStart(ts) {
  const week = weekOf(ts)
  let t = ts
  while (weekOf(t + 3_600_000) === week) t += 3_600_000
  while (weekOf(t + 60_000) === week) t += 60_000
  return t + 60_000
}

test('a leg running across Sunday midnight is not cut off', async (t) => {
  // Aoife is running a first leg on one of Fionn's runs, and Fionn a reply
  // to Rowan — each can only be in one race at a time.
  const ghostA = (await as('Fionn')('POST', '/api/runs', { track: track({ endAgoMs: 12 * 3_600_000 }) })).json().run
  const ghostB = (await as('Fionn')('POST', '/api/runs', { track: track({ endAgoMs: 14 * 3_600_000 }) })).json().run
  giveFuel('Aoife', 30)
  giveFuel('Rowan', 30)
  const challenge = (await as('Aoife')('POST', '/api/duels', { runId: ghostA.id })).json().duel
  const reply = (await as('Rowan')('POST', '/api/duels', { runId: ghostB.id })).json().duel
  backdate(reply.id, 1, { endAgoMs: 2_000 })
  await as('Rowan')('POST', '/api/runs', { track: track({ speed: 3.2, endAgoMs: 2_000 }), duelId: reply.id })
  assert.equal((await as('Fionn')('POST', `/api/duels/${reply.id}/reply`)).statusCode, 200)

  // Both legs began at 23:54 on the duel's Sunday.
  const midnight = nextWeekStart(Date.now())
  db.prepare('UPDATE duels SET leg1_started_at = ? WHERE id = ?').run(midnight - 6 * 60_000, challenge.id)
  db.prepare('UPDATE duels SET leg2_started_at = ? WHERE id = ?').run(midnight - 6 * 60_000, reply.id)
  assert.equal(settleDue(midnight + 60_000), 0, 'midnight does not cut off a leg still running')
  assert.equal(duelRow(challenge.id).status, 'leg1')
  assert.equal(duelRow(reply.id).status, 'leg2')

  // Half past midnight: both runs, started at 23:55, come in.
  mock.timers.enable({ apis: ['Date'], now: midnight + 30 * 60_000 })
  t.after(() => mock.timers.reset())
  const late = (await as('Aoife')('POST', '/api/runs', {
    track: track({ speed: 3.2, endAgoMs: 5 * 60_000 }), duelId: challenge.id,
  })).json()
  assert.equal(late.run.kind, 'duel')
  assert.equal(late.duel.status, 'void', 'no week is left to reply in')
  assert.equal(late.player.fuel, 30 + late.run.fuel, 'the duel’s Fuel comes back; the run pays as any run')

  const replied = (await as('Fionn')('POST', '/api/runs', {
    track: track({ speed: 3.3, endAgoMs: 4 * 60_000 }), duelId: reply.id,
  })).json()
  assert.equal(replied.run.kind, 'duel')
  assert.equal(replied.duel.status, 'settled')
  assert.equal(replied.duel.legs.target.quit, false)
})

test('a leg is one attempt: a run started long after the leg began counts as solo', async () => {
  const fionnGhost = (await as('Fionn')('POST', '/api/runs', { track: track({ endAgoMs: 16 * 3_600_000 }) })).json().run
  giveFuel('Rowan', 30)
  const { duel } = (await as('Rowan')('POST', '/api/duels', { runId: fionnGhost.id })).json()
  // The leg began an hour before this run: other attempts could have come between.
  db.prepare('UPDATE duels SET leg1_started_at = ? WHERE id = ?').run(Date.now() - 3_600_000 - 1_860_000, duel.id)
  const best = await as('Rowan')('POST', '/api/runs', { track: track({ speed: 3.5 }), duelId: duel.id })
  assert.equal(best.json().run.kind, 'solo')
  assert.equal(best.json().duelClosed, true)
  assert.equal(duelRow(duel.id).status, 'leg1')
})
