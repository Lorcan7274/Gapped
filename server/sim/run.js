import fs from 'node:fs'
import { RATING, DUEL_POINTS, SEASON } from '../config/game.js'
import { WORLD } from './world.js'
import { simulate } from './simulate.js'
import { summarize, printReport, keyMetrics, averageMetrics, printComparison } from './report.js'

/**
 * The simulation harness: tune the hidden rating engine on synthetic
 * runners before it touches a real duel.
 *
 *   npm run sim                                  full report for config/game.js
 *   npm run sim -- --compare                     the standard variants side by side
 *   npm run sim -- --rating.evidence efforts     override any tunable, by group:
 *                  --rating.kEstablished 20       rating.*, points.*, season.*, world.*
 *                  --world.players 1000
 *   npm run sim -- --seed 7 --seeds 5            which seed(s); comparisons average them
 *   npm run sim -- --json out.json               also write the weekly series
 */

const GROUPS = { rating: RATING, points: DUEL_POINTS, season: SEASON, world: WORLD }

function parse(argv) {
  const flags = { overrides: { rating: {}, points: {}, season: {}, world: {} } }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}`)
    const key = arg.slice(2)
    if (key === 'compare') {
      flags.compare = true
      continue
    }
    const raw = argv[++i]
    if (raw == null) throw new Error(`--${key} needs a value`)
    const [group, name] = key.split('.')
    if (name) {
      if (!GROUPS[group] || !(name in GROUPS[group])) throw new Error(`Unknown tunable --${key}`)
      const current = GROUPS[group][name]
      flags.overrides[group][name] = typeof current === 'number' ? Number(raw) : raw
    } else if (['seed', 'seeds'].includes(key)) {
      flags[key] = Number(raw)
    } else if (key === 'json') {
      flags.json = raw
    } else {
      throw new Error(`Unknown flag --${key}`)
    }
  }
  return flags
}

function configFor(overrides, extra = {}) {
  return {
    rating: { ...RATING, ...overrides.rating, ...extra.rating },
    points: { ...DUEL_POINTS, ...overrides.points, ...extra.points },
    season: { ...SEASON, ...overrides.season, ...extra.season },
    world: { ...WORLD, ...overrides.world, ...extra.world },
  }
}

const VARIANTS = [
  ['as configured', {}],
  ["evidence 'efforts'", { rating: { evidence: 'efforts' } }],
  ['no quit penalty', { rating: { quitPenalty: 0 } }],
  ['K 20', { rating: { kEstablished: 20 } }],
  ['K 45', { rating: { kEstablished: 45 } }],
  ['provisional K 80', { rating: { kProvisional: 80 } }],
  ['no season squash', { season: { squash: 1, provisionalBoost: 0 } }],
  ['squash 0.9', { season: { squash: 0.9 } }],
]

function main() {
  const flags = parse(process.argv.slice(2))
  const seed = flags.seed ?? 1

  if (flags.compare) {
    const seeds = flags.seeds ?? 3
    const started = Date.now()
    const rows = VARIANTS.map(([name, extra]) => {
      const config = configFor(flags.overrides, extra)
      const runs = []
      for (let k = 0; k < seeds; k++) {
        runs.push(keyMetrics(summarize(simulate({ ...config, seed: seed + k }), config.rating)))
      }
      return { name, m: averageMetrics(runs) }
    })
    const { world } = configFor(flags.overrides)
    console.log(`\nVARIANTS — averaged over seeds ${seed}–${seed + seeds - 1}, ` +
      `${world.players} runners, ${world.weeks} weeks each`)
    const base = Object.entries(flags.overrides)
      .flatMap(([group, values]) => Object.entries(values).map(([k, v]) => `${group}.${k}=${v}`))
    console.log(base.length ? `Every variant on top of: ${base.join(', ')}\n` : 'Every variant on top of config/game.js as is\n')
    console.log(printComparison(rows))
    console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`)
    return
  }

  const config = configFor(flags.overrides)
  const result = simulate({ ...config, seed })
  const summary = summarize(result, config.rating)
  const changed = Object.entries(flags.overrides)
    .flatMap(([group, values]) => Object.entries(values).map(([k, v]) => `${group}.${k}=${v}`))
  console.log(printReport(summary,
    `GAPPED RATING SIMULATION — seed ${seed}, ${config.world.players} runners, ${config.world.weeks} weeks` +
    (changed.length ? ` — ${changed.join(', ')}` : ' — config/game.js as is')))
  if (flags.json) {
    fs.writeFileSync(flags.json, JSON.stringify({ config, summary }, null, 2))
    console.log(`\nWrote ${flags.json}`)
  }
}

main()
