import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DUEL } from '../config/game.js'
import { walkTrack } from './track.js'
import { timeToCover, cutProfile, ghostMetresAt, compactProfile } from './ghost.js'

const LAT = 53.34
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180)
const T0 = Date.UTC(2026, 8, 21, 9, 0, 0)

/** One fix a second heading east at `speed` m/s, after `lock` bad fixes. */
function run({ seconds = 600, speed = 3, lock = 0 } = {}) {
  const bad = Array.from({ length: lock }, (_, i) => ({ t: T0 + i * 1000, lat: LAT, lng: -6.26, acc: 80 }))
  const good = Array.from({ length: seconds + 1 }, (_, i) => ({
    t: T0 + (lock + i) * 1000, lat: LAT, lng: -6.26 + (i * speed) / M_PER_DEG_LNG, acc: 5,
  }))
  return [...bad, ...good]
}

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`)

describe('distance profiles', () => {
  test('time runs from the first accepted fix, so waiting for GPS is not racing', () => {
    const { profile, firstAccepted } = walkTrack(run({ lock: 20 }))
    assert.equal(profile[0][0], 0)
    assert.equal(firstAccepted.t, T0 + 20_000)
    close(profile.at(-1)[1], 1800, 5)
    assert.equal(profile.at(-1)[0], 600_000)
  })

  test('standing still adds time but no distance', () => {
    const points = run({ seconds: 100 })
    const last = points.at(-1)
    for (let i = 1; i <= 30; i++) points.push({ ...last, t: last.t + i * 1000 })
    const { profile } = walkTrack(points)
    assert.equal(profile.at(-1)[0], 130_000)
    assert.equal(profile.at(-1)[1], profile.at(-31)[1])
  })

  test('compacting keeps whole ms and decimetres', () => {
    assert.deepEqual(compactProfile([[0.4, 0], [1000.6, 3.14159]]), [[0, 0], [1001, 3.1]])
  })
})

describe('time to cover a distance', () => {
  const { profile } = walkTrack(run({ seconds: 600, speed: 3 }))

  test('interpolates between fixes', () => {
    close(timeToCover(profile, 1000), 333_333, 2_000)
    close(timeToCover(profile, 1500), 500_000, 2_000)
  })

  test('a track that never reaches the line is a quit', () => {
    assert.equal(timeToCover(profile, 2000), null)
  })

  test('stopping a hair short of the line is extrapolated at the closing pace', () => {
    const end = profile.at(-1)
    const t = timeToCover(profile, end[1] + DUEL.finishToleranceM - 1)
    close(t, end[0] + ((DUEL.finishToleranceM - 1) / 3) * 1000, 300)
    assert.equal(timeToCover(profile, end[1] + DUEL.finishToleranceM + 1), null)
  })

  test('refuses nonsense', () => {
    assert.equal(timeToCover([], 1000), null)
    assert.equal(timeToCover(profile, 0), null)
    assert.equal(timeToCover(null, 1000), null)
  })
})

describe('ghost replay', () => {
  const { profile } = walkTrack(run({ seconds: 600, speed: 3 }))

  test('the ghost is where the runner was, and waits at its finish', () => {
    assert.equal(ghostMetresAt(profile, 0), 0)
    close(ghostMetresAt(profile, 100_000), 300, 4)
    close(ghostMetresAt(profile, 100_500), 301.5, 4)
    assert.equal(ghostMetresAt(profile, 10_000_000), profile.at(-1)[1])
  })

  test('a cut ghost ends exactly on the line', () => {
    const cut = cutProfile(profile, 1000)
    assert.deepEqual(cut.at(-1)[1], 1000)
    close(cut.at(-1)[0], timeToCover(profile, 1000), 0)
    assert.ok(cut.every(([, m], i) => i === 0 || m >= cut[i - 1][1]))
    assert.equal(cutProfile(profile, 5000), null)
  })

  test('racing a copy of the ghost is a dead heat all the way', () => {
    for (const t of [0, 1234, 60_000, 333_000, 599_999]) {
      assert.equal(ghostMetresAt(profile, t), ghostMetresAt(profile.map((p) => [...p]), t))
    }
  })
})
