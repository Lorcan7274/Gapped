import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { TRACK, SHARDS, FUEL, SOLO_POINTS, STREAK, RATING } from '../config/game.js'
import { parseTrack, summariseTrack, encodeTrack, decodeTrack, TrackError } from './track.js'
import {
  localDay, addDays, weekOf, intensity, nextStreak, currentStreak, streakMultiplier,
  soloRewards, countsForStreak,
} from './economy.js'
import { expectedTime } from './rating.js'
import { tierOf, ladderLabel, ladderPosition } from './ladder.js'

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0)
const LAT = 53.34
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180)

/** A straight run east: one fix a second at `speed` m/s. */
function straightRun({ seconds = 600, speed = 3, start = NOW - 3_600_000, acc = 5 } = {}) {
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    t: start + i * 1000, lat: LAT, lng: -6.26 + (i * speed) / M_PER_DEG_LNG, acc,
  }))
}

const code = (fn) => {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof TrackError, String(error))
    return error.code
  }
  return null
}

describe('uploaded tracks', () => {
  test('a clean run measures what it covered', () => {
    const s = summariseTrack(parseTrack(straightRun(), { now: NOW }))
    assert.ok(Math.abs(s.distanceM - 1800) < 5, s.distanceM)
    assert.equal(s.elapsedMs, 600_000)
    assert.deepEqual(s.flags, [])
    assert.equal(s.hasSteps, false)
  })

  test('the phone filter applies: bad accuracy, teleports and jitter do not count', () => {
    const run = straightRun({ seconds: 300 })
    run[100] = { ...run[100], acc: 80 }
    run[150] = { ...run[150], lng: run[150].lng + 0.01 } // a 670 m jump
    const s = summariseTrack(parseTrack(run, { now: NOW }))
    assert.ok(Math.abs(s.distanceM - 900) < 10, s.distanceM)
    assert.equal(s.rejected, 2)

    const standing = Array.from({ length: 300 }, (_, i) => ({
      t: NOW - 600_000 + i * 1000, lat: LAT + ((i % 3) - 1) * 0.000008, lng: -6.26, acc: 4,
    }))
    assert.equal(summariseTrack(parseTrack(standing, { now: NOW })).distanceM, 0)
  })

  test('implausible runs are flagged, not refused', () => {
    assert.deepEqual(summariseTrack(parseTrack(straightRun({ speed: 9 }), { now: NOW })).flags, ['too_fast'])
    const noisy = straightRun({ seconds: 100 }).map((p, i) => (i % 3 ? { ...p, acc: 60 } : p))
    assert.ok(summariseTrack(parseTrack(noisy, { now: NOW })).flags.includes('noisy'))
  })

  test('waiting for a GPS fix before the run is not noise', () => {
    const run = straightRun({ seconds: 300 })
    const waiting = Array.from({ length: 400 }, (_, i) => ({
      t: run[0].t - (400 - i) * 1000, lat: LAT, lng: -6.26, acc: 45,
    }))
    const s = summariseTrack(parseTrack([...waiting, ...run], { now: NOW }))
    assert.deepEqual(s.flags, [])
    assert.equal(s.rejected, 0)
    assert.ok(Math.abs(s.distanceM - 900) < 5, s.distanceM)
  })

  test('malformed uploads are refused with a reason', () => {
    const run = straightRun({ seconds: 10 })
    assert.equal(code(() => parseTrack(null, { now: NOW })), 'track_missing')
    assert.equal(code(() => parseTrack([run[0]], { now: NOW })), 'track_short')
    assert.equal(code(() => parseTrack([run[0], { ...run[1], lat: 91 }], { now: NOW })), 'track_invalid')
    assert.equal(code(() => parseTrack([run[1], run[0]], { now: NOW })), 'track_order')
    assert.equal(code(() => parseTrack(straightRun({ start: NOW + 3_600_000 }), { now: NOW })), 'track_future')
    assert.equal(code(() => parseTrack(straightRun({ start: NOW - 8 * 86_400_000 }), { now: NOW })), 'track_stale')
    const marathon = [{ ...run[0], t: NOW - 7 * 3_600_000 }, { ...run[1], t: NOW - 1000 }]
    assert.equal(code(() => parseTrack(marathon, { now: NOW })), 'track_long')
    assert.equal(code(() => parseTrack(new Array(TRACK.maxSamples + 1).fill(run[0]), { now: NOW })), 'track_long')
  })

  test('storage round-trips to within a tenth of a metre', () => {
    const run = straightRun({ seconds: 20 }).map((p, i) => ({ ...p, alt: 12.34 + i, steps: i * 3 }))
    const back = decodeTrack(encodeTrack(run))
    assert.equal(back.length, run.length)
    for (let i = 0; i < run.length; i++) {
      assert.equal(back[i].t, run[i].t)
      assert.ok(Math.abs(back[i].lat - run[i].lat) < 1e-6 && Math.abs(back[i].lng - run[i].lng) < 1e-6)
      assert.equal(back[i].steps, run[i].steps)
    }
    assert.ok(encodeTrack(run).length < JSON.stringify(run).length)
  })
})

describe('calendar', () => {
  test('days are Dublin days', () => {
    // 23:30 UTC in June is 00:30 Irish summer time the next day; in January it is not.
    assert.equal(localDay(Date.UTC(2026, 5, 10, 23, 30)), '2026-06-11')
    assert.equal(localDay(Date.UTC(2026, 0, 10, 23, 30)), '2026-01-10')
  })

  test('weeks are named by their Monday and run to Sunday night', () => {
    assert.equal(weekOf(Date.UTC(2026, 8, 27, 20, 0)), '2026-09-21') // Sunday evening
    assert.equal(weekOf(Date.UTC(2026, 8, 27, 23, 30)), '2026-09-28') // past midnight in Dublin
    assert.equal(weekOf(Date.UTC(2026, 8, 21, 9, 0)), '2026-09-21')
  })

  test('adding days crosses months and years', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  })
})

describe('streaks', () => {
  test('consecutive days build a streak; the same day twice does not; a gap starts again', () => {
    let s = nextStreak({}, '2026-09-20')
    assert.deepEqual(s, { days: 1, lastDay: '2026-09-20' })
    s = nextStreak(s, '2026-09-21')
    assert.equal(s.days, 2)
    assert.equal(nextStreak(s, '2026-09-21').days, 2)
    assert.equal(nextStreak(s, '2026-09-23').days, 1)
    // An older run uploaded late leaves a newer streak alone.
    assert.deepEqual(nextStreak(s, '2026-09-19'), s)
  })

  test('a streak shows until a whole day is missed', () => {
    const s = { days: 4, lastDay: '2026-09-26' }
    assert.equal(currentStreak(s, '2026-09-26'), 4)
    assert.equal(currentStreak(s, '2026-09-27'), 4)
    assert.equal(currentStreak(s, '2026-09-28'), 0)
    assert.equal(currentStreak({}, '2026-09-28'), 0)
  })

  test('the streak bonus is small and capped', () => {
    assert.equal(streakMultiplier(1), 1)
    assert.equal(streakMultiplier(3), 1 + 2 * STREAK.bonusPerDay)
    assert.equal(streakMultiplier(100), 1 + STREAK.maxBonusDays * STREAK.bonusPerDay)
    assert.equal(countsForStreak(STREAK.minMinutes - 1), false)
  })
})

describe('solo rewards', () => {
  test('intensity is 1 at race pace, lower when easy, capped when implausibly fast', () => {
    const t = expectedTime(1200, 5000) * 1000
    assert.ok(Math.abs(intensity(1200, 5000, t) - 1) < 1e-9)
    assert.ok(intensity(1200, 5000, t * 1.25) < 0.81)
    assert.equal(intensity(1200, 5000, t / 3), SHARDS.maxIntensity)
    assert.equal(intensity(1200, RATING.minDistanceM - 1, 60_000), 0)
    assert.equal(intensity(1200, 5000, 0), 0)
  })

  test('a hard short run and a long easy one both pay; a short jog pays nothing', () => {
    const hard5k = soloRewards({ minutes: 25, intensity: 1 })
    const longEasy = soloRewards({ minutes: 60, intensity: 0.8 })
    const jog = soloRewards({ minutes: 5, intensity: 0.9 })
    assert.equal(hard5k.shards, 25)
    assert.equal(longEasy.shards, 38)
    assert.deepEqual(jog, { shards: 0, fuel: 0, points: 0, capped: false })
    assert.equal(hard5k.fuel, Math.round(25 * FUEL.perShard))
    assert.equal(hard5k.points, Math.round(25 * SOLO_POINTS.perShard))
  })

  test('the ramp from the minimum to full minutes is linear', () => {
    const at = (minutes) => soloRewards({ minutes, intensity: 1 }).shards
    assert.equal(at(SHARDS.minMinutes), 0)
    assert.equal(at((SHARDS.minMinutes + SHARDS.fullMinutes) / 2), Math.round(12.5 * 0.5))
    assert.equal(at(SHARDS.fullMinutes), SHARDS.fullMinutes)
  })

  test('daily caps hold, and nothing is ever negative', () => {
    const r = soloRewards({ minutes: 60, intensity: 1, today: { shards: SHARDS.dailyCap - 10, fuel: FUEL.dailyCap, points: SOLO_POINTS.dailyCap - 1 } })
    assert.equal(r.shards, 10)
    assert.equal(r.fuel, 0)
    assert.equal(r.points, 1)
    assert.equal(r.capped, true)
    const over = soloRewards({ minutes: 60, intensity: 1, today: { shards: 999, fuel: 999, points: 999 } })
    assert.deepEqual(over, { shards: 0, fuel: 0, points: 0, capped: true })
  })

  test('a streak pays a little more', () => {
    assert.ok(soloRewards({ minutes: 60, intensity: 1, streakDays: 7 }).shards >
      soloRewards({ minutes: 60, intensity: 1, streakDays: 1 }).shards)
  })
})

describe('ladder', () => {
  test('unknown tiers fall back to the bottom', () => {
    assert.equal(tierOf('platinum').key, 'bronze')
    assert.equal(tierOf('gold').name, 'Gold')
  })

  test('divisions only show once a tier has more than one', () => {
    assert.equal(ladderLabel('gold', 1, 1), 'Gold')
    assert.equal(ladderLabel('gold', 2, 3), 'Gold II')
    assert.deepEqual(ladderPosition('gold', 9, 3).division, 3)
  })
})
