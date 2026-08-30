import { createTracker } from './client/src/lib/tracker.js'

/* ---------------- a real 400 m track, lane 1 ----------------
   Two 84.39 m straights and two semicircles of radius 36.80 m.
   2*84.39 + 2*pi*36.80 = 400.0 m                                */
const STRAIGHT = 84.39, RADIUS = 36.80
const BEND = Math.PI * RADIUS
const LAP = 2 * STRAIGHT + 2 * BEND

/** Position in local metres (x east, y north) at distance s around the lap. */
function pointAt(s) {
  const d = ((s % LAP) + LAP) % LAP
  if (d < STRAIGHT) return { x: d, y: 0 }
  if (d < STRAIGHT + BEND) {
    const a = (d - STRAIGHT) / RADIUS
    return { x: STRAIGHT + RADIUS * Math.sin(a), y: RADIUS * (1 - Math.cos(a)) }
  }
  if (d < 2 * STRAIGHT + BEND) {
    return { x: STRAIGHT - (d - STRAIGHT - BEND), y: 2 * RADIUS }
  }
  const a = (d - 2 * STRAIGHT - BEND) / RADIUS
  return { x: -RADIUS * Math.sin(a), y: RADIUS * (1 + Math.cos(a)) }
}

const LAT0 = 51.5074, LNG0 = -0.1278
const toLatLng = ({ x, y }) => ({
  lat: LAT0 + y / 111_320,
  lng: LNG0 + x / (111_320 * Math.cos((LAT0 * Math.PI) / 180)),
})

/* GPS error is not white noise: multipath and satellite geometry drift
   slowly, so consecutive fixes are wrong in a similar direction. Modelled
   as a mean-reverting walk plus a small independent jitter. */
function makeNoise(sigma, rng) {
  let bx = 0, by = 0
  const theta = 0.08          // how fast the bias reverts
  return () => {
    bx += theta * (0 - bx) + sigma * 0.35 * rng.normal()
    by += theta * (0 - by) + sigma * 0.35 * rng.normal()
    return { dx: bx + sigma * 0.4 * rng.normal(), dy: by + sigma * 0.4 * rng.normal() }
  }
}

function rngFrom(seed) {
  let s = seed >>> 0
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  return {
    next,
    normal() {
      const u = Math.max(next(), 1e-9), v = next()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
  }
}

/** Run one athlete and return what the tracker believes. */
function run({ metres, speed, accuracy, seed, hz = 1 }) {
  const rng = rngFrom(seed)
  const noise = makeNoise(accuracy / 2, rng)
  let state = null
  const tracker = createTracker({ onUpdate: (s) => { state = s } })
  const step = speed / hz
  let at = Date.now()
  for (let s = 0; s <= metres; s += step) {
    const truth = pointAt(s)
    const { dx, dy } = noise()
    // Reported accuracy wobbles around the nominal value.
    const reported = Math.max(3, accuracy * (0.7 + 0.6 * rng.next()))
    tracker.push({
      ...toLatLng({ x: truth.x + dx, y: truth.y + dy }),
      accuracy: reported,
      timestamp: at,
    })
    at += 1000 / hz
  }
  return { measured: state?.metres ?? 0, ...state }
}

const pct = (m, t) => ((m - t) / t) * 100
const row = (label, measured, truth, extra = '') =>
  console.log(
    `  ${label.padEnd(26)} true ${String(truth).padStart(5)} m   read ${measured.toFixed(0).padStart(5)} m   ` +
    `${(pct(measured, truth) >= 0 ? '+' : '')}${pct(measured, truth).toFixed(1)}%  ${extra}`
  )

console.log('=== ONE RUNNER, 400 m TRACK, varying GPS quality ===')
for (const acc of [5, 8, 12, 20, 30]) {
  const r = run({ metres: 400, speed: 3.5, accuracy: acc, seed: 7 })
  row(`accuracy ~${acc} m`, r.measured, 400, `accepted ${r.accepted}, rejected ${r.rejected}`)
}

console.log('\n=== DISTANCE GROWS WITH LAPS (5 km = 12.5 laps) ===')
for (const d of [400, 800, 1600, 3000, 5000]) {
  const r = run({ metres: d, speed: 3.5, accuracy: 8, seed: 11 })
  row(`${d} m`, r.measured, d, `accepted ${r.accepted}, rejected ${r.rejected}`)
}

console.log('\n=== THE NUMBER THAT MATTERS: gap between two runners ===')
console.log('  Both cover the SAME true distance, so the true gap is 0 m.')
for (const [d, acc] of [[400,8],[1000,8],[3000,8],[5000,8],[3000,15]]) {
  const a = run({ metres: d, speed: 3.5, accuracy: acc, seed: 3 })
  const b = run({ metres: d, speed: 3.5, accuracy: acc, seed: 99 })
  const gap = a.measured - b.measured
  console.log(
    `  ${String(d).padStart(4)} m @ ~${acc} m acc  ->  A ${a.measured.toFixed(0)} m, B ${b.measured.toFixed(0)} m, ` +
    `phantom gap ${gap >= 0 ? '+' : ''}${gap.toFixed(0)} m`
  )
}

console.log('\n=== STANDING STILL FOR 2 MINUTES (drift) ===')
{
  const rng = rngFrom(5)
  const noise = makeNoise(4, rng)
  let state = null
  const t = createTracker({ onUpdate: (s) => { state = s } })
  let at = Date.now()
  for (let i = 0; i < 120; i++) {
    const { dx, dy } = noise()
    t.push({ ...toLatLng({ x: dx, y: dy }), accuracy: 8, timestamp: at })
    at += 1000
  }
  console.log(`  true 0 m -> read ${state.metres.toFixed(0)} m of pure drift`)
}

console.log('\n=== SLOW MOVEMENT STILL COUNTS (the risk of an 8 m floor) ===')
for (const [label, speed] of [['walking 1.4 m/s', 1.4], ['jogging 2.5 m/s', 2.5], ['running 4.5 m/s', 4.5]]) {
  const r = run({ metres: 1000, speed, accuracy: 8, seed: 21 })
  row(label, r.measured, 1000, `accepted ${r.accepted}, held ${r.heldNoise ?? 0}`)
}

console.log('\n=== A REAL RACE: one runner genuinely 50 m ahead over 3 km ===')
{
  const a = run({ metres: 3000, speed: 3.5, accuracy: 8, seed: 3 })
  const b = run({ metres: 2950, speed: 3.44, accuracy: 8, seed: 99 })
  console.log(`  true gap 50 m -> reported ${(a.measured - b.measured).toFixed(0)} m`)
}
