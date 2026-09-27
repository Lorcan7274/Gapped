import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RATING, DUEL_POINTS, SEASON } from '../config/game.js'
import { WORLD } from './world.js'
import { simulate } from './simulate.js'
import { summarize } from './report.js'

const small = { ...WORLD, players: 150, weeks: 12, poolSize: 25 }
const run = (overrides = {}, seed = 5) => {
  const config = {
    world: { ...small, ...overrides.world },
    rating: { ...RATING, ...overrides.rating },
    points: { ...DUEL_POINTS, ...overrides.points },
    season: { ...SEASON, ...overrides.season },
  }
  return summarize(simulate({ ...config, seed }), config.rating)
}

test('the same seed replays the same history', () => {
  assert.deepEqual(run().final, run().final)
  assert.notDeepEqual(run({}, 5).final, run({}, 6).final)
})

test('hidden ratings converge on true ability', () => {
  const s = run({ rating: { evidence: 'efforts' } })
  const first = s.series.find((w) => w.established > 20)
  assert.ok(s.final.rmseEstablished < first.rmseEstablished, 'error falls as results come in')
  assert.ok(s.final.spearman > 0.95, `rank correlation ${s.final.spearman}`)
  const curve = s.newcomers.placed
  assert.ok(curve.find((c) => c.n === 5).meanError < curve.find((c) => c.n === 0).meanError)
})

test('a re-anchoring reset measures drift and applies it', () => {
  const s = run({
    world: { weeks: 10 },
    rating: { evidence: 'efforts' },
    season: { lengthWeeks: 5, squash: 1, provisionalBoost: 0, reanchor: true, reanchorMinEfforts: 50 },
  })
  assert.equal(s.resets.length, 1)
  assert.ok(Number.isFinite(s.resets[0].drift) && s.resets[0].drift !== 0)
})

test('every duel settles to a known outcome with integer points', () => {
  const { duels } = simulate({ world: small, rating: RATING, points: DUEL_POINTS, season: SEASON, seed: 9 })
  assert.ok(duels.length > 100)
  const outcomes = new Set(['challenger', 'target', 'tie', 'walkover', 'withdrawn'])
  for (const d of duels) {
    assert.ok(outcomes.has(d.outcome), d.outcome)
    assert.ok(Number.isInteger(d.points.challenger) && Number.isInteger(d.points.target))
  }
})
