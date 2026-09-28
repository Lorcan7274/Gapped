/**
 * Seeded randomness for the simulation, so a run is reproducible from its
 * seed: mulberry32 underneath, with the few distributions the world needs.
 */
export function createRng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  let spare = null
  const normal = (mean = 0, sd = 1) => {
    if (spare != null) {
      const z = spare
      spare = null
      return mean + sd * z
    }
    // Box–Muller; 1 - next() keeps log away from zero.
    const r = Math.sqrt(-2 * Math.log(1 - next()))
    const theta = 2 * Math.PI * next()
    spare = r * Math.sin(theta)
    return mean + sd * r * Math.cos(theta)
  }

  const uniform = (lo, hi) => lo + next() * (hi - lo)

  return {
    next,
    uniform,
    normal,
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    /** exp(normal) scaled so the median is `median`. */
    logNormal: (median, sd) => median * Math.exp(normal(0, sd)),
    poisson(lambda) {
      if (lambda <= 0) return 0
      const limit = Math.exp(-lambda)
      let k = 0
      let p = next()
      while (p > limit) {
        k += 1
        p *= next()
      }
      return k
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
      return items
    },
  }
}
