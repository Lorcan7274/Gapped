/**
 * Adversarial stress suite. Run against a server you do not mind filling
 * with junk accounts:
 *
 *   GAP_URL=http://127.0.0.1:3000 node scripts/stress.mjs
 *
 * Sections 3 onwards need to create many accounts, so start the server with
 * RATE_LIMIT_DISABLED=1 to exercise them; run once without it to confirm the
 * limits themselves still bite.
 */
import WebSocket from 'ws'

const BASE = process.env.GAP_URL || 'http://127.0.0.1:3000'
const WS = BASE.replace(/^http/, 'ws')
const findings = []
const flag = (sev, area, what) => { findings.push({ sev, area, what }); console.log(`  ${sev} ${area}: ${what}`) }
const ok = (area, what) => console.log(`  ok   ${area}: ${what}`)

const post = async (p, body, headers = {}) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const get = async (p, headers = {}) => {
  const r = await fetch(BASE + p, { headers })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const stamp = Date.now()
const reg = async (name, tag) => {
  const r = await post('/api/auth/register', {
    email: `${tag}.${stamp}@example.com`, password: 'password1234',
    displayName: name, lat: 51.5074, lng: -0.1278,
  })
  return { token: r.body.token, id: r.body.player?.id, auth: { authorization: `Bearer ${r.body.token}` } }
}
const conn = (token) => new Promise((res, rej) => {
  const ws = new WebSocket(`${WS}/ws?token=${token}`); ws.f = []
  ws.on('message', (m) => ws.f.push(JSON.parse(m)))
  ws.on('open', () => res(ws)); ws.on('error', rej)
})
const waitFor = (ws, t, ms = 3000) => new Promise((res) => {
  const hit = ws.f.find((x) => x.type === t); if (hit) return res(hit)
  const to = setTimeout(() => res(null), ms)
  const on = (r) => { const m = JSON.parse(r); if (m.type === t) { clearTimeout(to); ws.off('message', on); res(m) } }
  ws.on('message', on)
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('\n== 1. AUTH ABUSE ==')
{
  const long = 'a'.repeat(5000)
  ;(await post('/api/auth/register', { email: `${long}@x.com`, password: 'password1234', displayName: 'X' })).status === 400
    ? ok('auth', 'absurdly long email refused') : flag('WARN', 'auth', 'long email accepted')
  ;(await post('/api/auth/register', { email: `p.${stamp}@x.com`, password: 'p'.repeat(100000), displayName: 'X' })).status === 400
    ? ok('auth', '100k-char password refused') : flag('WARN', 'auth', '100k password accepted')
  await post('/api/auth/register', { email: `i.${stamp}'; DROP TABLE players;--@x.com`, password: 'password1234', displayName: 'X' })
  ;(await get('/api/meta')).status === 200
    ? ok('auth', 'sql injection harmless (prepared statements)') : flag('CRIT', 'auth', 'server broken after injection')
  ;(await post('/api/auth/register', { email: null, password: null, displayName: null })).status === 400
    ? ok('auth', 'all-null body refused') : flag('WARN', 'auth', 'null body accepted')

  const victim = await reg('Victim', `v.${stamp}`)
  const tries = await Promise.all(Array.from({ length: 40 }, () =>
    post('/api/auth/login', { email: `v.${stamp}.${stamp}@example.com`, password: 'wrongpassword' })))
  const throttled = tries.filter((t) => t.status === 429).length
  throttled > 0 ? ok('auth', `brute force throttled (${throttled}/40 got 429)`)
    : flag('HIGH', 'auth', '40 wrong passwords, none throttled')

  const spam = await Promise.all(Array.from({ length: 40 }, (_, i) =>
    post('/api/auth/register', { email: `s${i}.${stamp}@x.com`, password: 'password1234', displayName: `S${i}` })))
  const made = spam.filter((s) => s.status === 201).length
  made === 40 ? flag('HIGH', 'auth', '40 accounts from one caller, unlimited')
    : ok('auth', `registration limited (${made}/40 succeeded)`)
}

console.log('\n== 2. IDENTITY / SESSION ==')
{
  const a = await reg('Alpha', `al.${stamp}`); const b = await reg('Beta', `be.${stamp}`)
  ;(await get('/api/me', a.auth)).body.player?.id === a.id
    ? ok('session', 'token returns its own player') : flag('CRIT', 'session', 'token returned the wrong player')
  ;(await post('/api/location', { lat: 0, lng: 0, playerId: b.id }, a.auth)).body.player?.id === a.id
    ? ok('session', 'body playerId cannot override the bearer token')
    : flag('CRIT', 'session', 'body playerId overrode the token — account takeover')
  ;(await get('/api/me', { authorization: 'Bearer ' + 'A'.repeat(43) })).status >= 400
    ? ok('session', 'forged token refused') : flag('CRIT', 'session', 'forged token accepted')
  await post('/api/auth/logout', {}, a.auth)
  ;(await get('/api/me', a.auth)).status >= 400
    ? ok('session', 'token dies on logout') : flag('HIGH', 'session', 'token survives logout')
}

console.log('\n== 3. DUEL RACE CONDITIONS ==')
let cheatCtx = null
{
  const a = await reg('Racer A', `ra.${stamp}`); const b = await reg('Racer B', `rb.${stamp}`)
  const wa = await conn(a.token); const wb = await conn(b.token)
  await waitFor(wa, 'ready'); await waitFor(wb, 'ready')

  wa.f.length = 0; wb.f.length = 0
  for (let i = 0; i < 10; i++) wa.send(JSON.stringify({ type: 'challenge', opponentId: b.id, distanceM: 400 }))
  await sleep(700)
  const prompts = wb.f.filter((f) => f.type === 'challenge:incoming').length
  prompts > 1 ? flag('MED', 'duel', `${prompts} prompts from 10 rapid challenges — no cooldown`)
    : ok('duel', `challenge spam collapsed to ${prompts} prompt`)

  const ids = wb.f.filter((f) => f.type === 'challenge:incoming').map((f) => f.challengeId)
  wa.f.length = 0
  for (const id of ids) wb.send(JSON.stringify({ type: 'challenge:respond', challengeId: id, accept: true }))
  await sleep(900)
  const starts = wa.f.filter((f) => f.type === 'match:start').length
  starts === 1 ? ok('duel', 'concurrent accepts start exactly one match')
    : flag('CRIT', 'duel', `${starts} matches started at once`)
  cheatCtx = { wa, wb, matchId: wa.f.find((f) => f.type === 'match:start')?.matchId }
}

console.log('\n== 4. CHEATING ==')
if (cheatCtx?.matchId) {
  const { wa, wb, matchId } = cheatCtx
  await sleep(5200)
  wa.f.length = 0; wb.f.length = 0
  wa.send(JSON.stringify({ type: 'match:progress', matchId, progressM: 999999, elapsedMs: 1000 }))
  await sleep(500)
  const tick = wb.f.find((f) => f.type === 'match:tick')
  if (tick && tick.progressM > 10000) flag('CRIT', 'cheat', `claimed ${tick.progressM} m relayed verbatim`)
  else if (tick) ok('cheat', `absurd progress clamped to ${Math.round(tick.progressM)} m by the speed ceiling`)

  wa.f.length = 0
  wa.send(JSON.stringify({ type: 'match:finish', matchId, elapsedMs: 1 }))
  await sleep(800)
  const end = wa.f.find((f) => f.type === 'match:end')
  end?.outcome === 'win' ? flag('CRIT', 'cheat', 'forged 1 ms finish won the duel')
    : ok('cheat', 'implausible finish rejected')
  wa.close(); wb.close()
} else {
  console.log('  skipped: no match started')
}

console.log('\n== 5. SOCKET ABUSE ==')
{
  const a = await reg('Flood', `fl.${stamp}`)
  const ws = await conn(a.token)
  await waitFor(ws, 'ready')
  ws.send('not json'); ws.send(JSON.stringify({ type: 'nonsense' })); ws.send(JSON.stringify({}))
  ws.send(JSON.stringify({ type: 'location', lat: 'abc', lng: {} }))
  await sleep(400)
  ws.readyState === ws.OPEN ? ok('socket', 'malformed frames do not kill the connection')
    : flag('HIGH', 'socket', 'malformed frame killed the socket')
  for (let i = 0; i < 3000; i++) ws.send(JSON.stringify({ type: 'ping' }))
  await sleep(1300)
  ;(await get('/api/health')).status === 200
    ? ok('socket', '3000-frame flood survived') : flag('CRIT', 'socket', 'flood took the server down')
  const pongs = ws.f.filter((f) => f.type === 'pong').length
  pongs > 500 ? flag('MED', 'socket', `${pongs} pongs — no inbound rate limit`)
    : ok('socket', `flood clipped to ${pongs} answered frames`)
  ws.close()
}

console.log('\n== 6. LOAD ==')
{
  const t0 = Date.now()
  const players = []
  for (let i = 0; i < 60; i++) players.push(await reg(`Load ${i}`, `ld${i}.${stamp}`))
  const sockets = []
  for (const p of players) if (p.token) sockets.push(await conn(p.token))
  await sleep(1500)
  const t1 = Date.now()
  const list = await get('/api/players')
  console.log(`  ${sockets.length} connected in ${t1 - t0}ms; /api/players -> ${list.body.players?.length} rows in ${Date.now() - t1}ms`)
  const sizes = sockets[0]?.f.filter((f) => f.type === 'players').map((f) => JSON.stringify(f).length) ?? []
  if (sizes.length) console.log(`  largest broadcast: ${Math.max(...sizes)} bytes over ${sizes.length} broadcasts`)
  for (const s of sockets) s.close()
}

console.log('\n\n================ FINDINGS ================')
const order = { CRIT: 0, HIGH: 1, MED: 2, WARN: 3 }
findings.sort((a, b) => order[a.sev] - order[b.sev])
if (!findings.length) console.log('  nothing found')
for (const f of findings) console.log(`  [${f.sev}] ${f.area}: ${f.what}`)
process.exit(findings.some((f) => f.sev === 'CRIT') ? 1 : 0)
