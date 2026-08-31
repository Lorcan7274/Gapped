/**
 * A low-poly faceted crystal, generated per tier rather than drawn: the
 * silhouette is triangulated into a rim + core mesh, each facet lit from the
 * upper left with seeded jitter so it reads as chunks of cut stone, and a
 * lightning vein forks down the face. Top tiers get bright colour patches
 * baked into whole facets. Seeded per tone, so the same stone renders every
 * time.
 *
 * The only non-typographic element in the app. Scales by `size` alone —
 * geometry lives in a 100-wide viewBox.
 */

const SHAPES = {
  kite: { r: 1.78, sil: [[50, 0], [100, 59], [50, 178], [0, 59]] },
  hex: { r: 1.282, sil: [[50, 0], [88, 29], [100, 77], [50, 128], [0, 77], [12, 29]] },
  bloom: { r: 1.25, sil: [[50, 0], [68, 17], [90, 27], [84, 65], [66, 115], [50, 125], [34, 115], [16, 65], [10, 27], [32, 17]] },
  spire: { r: 1.55, sil: [[50, 0], [63, 37], [80, 25], [74, 74], [62, 143], [50, 155], [38, 143], [26, 74], [20, 25], [37, 37]] },
  octa: { r: 1.35, sil: [[50, 0], [62, 46], [96, 67], [62, 89], [50, 135], [38, 89], [4, 67], [38, 46]] },
  star8: { r: 1.15, sil: [[50, 0], [66, 34], [100, 57], [66, 80], [50, 115], [34, 80], [0, 57], [34, 34]] },
  dagger: { r: 1.6, sil: [[50, 0], [88, 45], [72, 102], [50, 160], [28, 102], [12, 45]] },
}

const TONES = {
  bronze: { c: ['#f5dcc4', '#b2724a', '#2e1808'], shape: 'kite', mode: 'lines', glow: '#ffb44a', glow2: '#ffe0a8', seed: 11 },
  silver: { c: ['#f4f7fa', '#9aa7b4', '#20262c'], shape: 'hex', mode: 'lines', glow: '#ffffff', glow2: '#c8d4de', seed: 23 },
  gold: { c: ['#fdf0bd', '#c8a233', '#33230a'], shape: 'bloom', mode: 'lines', glow: '#fff4c2', glow2: '#ffce5c', seed: 37 },
  sapphire: { c: ['#dcd7fb', '#4f46e5', '#0d0b33'], shape: 'spire', mode: 'patches', glow: '#67f0dc', glow2: '#b7b0ff', seed: 5 },
  amethyst: { c: ['#ecdcfd', '#8b5cf6', '#1f0f3d'], shape: 'octa', mode: 'patches', glow: '#ff5ce4', glow2: '#ffd0f6', seed: 17 },
  diamond: { c: ['#eef6ff', '#6aa8ff', '#0c2038'], shape: 'star8', mode: 'patches', glow: '#7cf0d8', glow2: '#ff8a45', seed: 41 },
  garnet: { c: ['#f2ccd9', '#a43f5e', '#2b0d16'], shape: 'dagger', mode: 'lines', glow: '#ff7aa2', glow2: '#ffd0dc', seed: 29 },
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b)
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`
}

function build(tone, shapeName) {
  const shape = SHAPES[shapeName] ?? SHAPES.hex
  const sil = shape.sil
  const H = Math.round(shape.r * 100)
  const n = sil.length
  const cx = 50, cy = H * 0.47
  const rand = rng(TONES[tone] ? TONES[tone].seed : 7)
  const T = TONES[tone] ?? TONES.sapphire
  const [pale, mid, deep] = T.c

  // Inner ring: each silhouette vertex pulled toward the centre with jitter.
  const ring = sil.map(([x, y]) => {
    const t = 0.42 + rand() * 0.2
    return [x + (cx - x) * t + (rand() - 0.5) * 7, y + (cy - y) * t + (rand() - 0.5) * 7]
  })

  const tris = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    tris.push({ p: [sil[i], sil[j], ring[i]], core: false })
    tris.push({ p: [sil[j], ring[j], ring[i]], core: false })
    tris.push({ p: [ring[i], ring[j], [cx, cy]], core: true })
  }

  // Facets that carry a colour patch (top tiers): seeded picks, ~1 in 4.
  const patchy = T.mode === 'patches'

  const lx = -0.55, ly = -0.84 // light from the upper left
  const faces = tris.map((tri) => {
    const gx = (tri.p[0][0] + tri.p[1][0] + tri.p[2][0]) / 3
    const gy = (tri.p[0][1] + tri.p[1][1] + tri.p[2][1]) / 3
    const dx = gx - cx, dy = (gy - cy) / shape.r
    const len = Math.max(1, Math.hypot(dx, dy))
    let b = 0.58 + 0.38 * ((dx / len) * lx + (dy / len) * ly) + (rand() - 0.5) * 0.28
    if (tri.core) b += 0.16
    b = Math.max(0.14, Math.min(1, b))
    let fill = b > 0.5 ? mix(mid, pale, (b - 0.5) * 2) : mix(deep, mid, b * 2)
    if (patchy && rand() < 0.3) {
      const patchColor = rand() < 0.5 ? T.glow : T.glow2
      fill = mix(patchColor, '#ffffff', Math.max(0, b - 0.55) * 0.8)
    }
    return { pts: tri.p.map((pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' '), fill }
  })

  // Lightning vein: a jagged fork from near the tip down the face.
  const vy0 = H * 0.08, vy1 = H * 0.78
  const steps = 6
  let vx = 48 + rand() * 6
  const main = []
  for (let s = 0; s <= steps; s++) {
    const y = vy0 + ((vy1 - vy0) * s) / steps + (rand() - 0.5) * 6
    main.push(`${vx.toFixed(1)},${y.toFixed(1)}`)
    vx += (rand() - 0.5) * 18 + (s % 2 ? 7 : -7)
    vx = Math.max(34, Math.min(66, vx))
  }
  const bi = 2 + Math.floor(rand() * 2)
  const [bx, by] = main[bi].split(',').map(Number)
  const branch = [
    `${bx},${by}`,
    `${(bx + 10 + rand() * 6).toFixed(1)},${(by + 10 + rand() * 8).toFixed(1)}`,
    `${(bx + 15 + rand() * 8).toFixed(1)},${(by + 24 + rand() * 8).toFixed(1)}`,
  ]
  const bright = patchy ? 0.95 : 0.65
  const veinColor = patchy ? '#ffffff' : pale
  const veins = [
    { pts: main.join(' '), stroke: T.glow, sw: 3.2, op: patchy ? 0.4 : 0.25 },
    { pts: main.join(' '), stroke: veinColor, sw: 1.3, op: bright },
    { pts: branch.join(' '), stroke: veinColor, sw: 0.9, op: bright * 0.75 },
  ]

  const clip = 'polygon(' + sil.map(([x, y]) => `${x}% ${(y / shape.r).toFixed(1)}%`).join(', ') + ')'
  return { tris: faces, veins, vb: `0 0 100 ${H}`, ratio: shape.r, clip }
}

// Deterministic per (tone, shape), so every stone is cut exactly once.
const cache = new Map()
function built(tone, shapeName) {
  const key = `${tone}/${shapeName}`
  if (!cache.has(key)) cache.set(key, build(tone, shapeName))
  return cache.get(key)
}

export function Shard({ size = 78, tone = 'sapphire', shape = null, still = false, delay = 0, className = '' }) {
  const toneKey = TONES[tone] ? tone : 'sapphire'
  const shapeName = SHAPES[shape] ? shape : TONES[toneKey].shape
  const g = built(toneKey, shapeName)
  return (
    <span
      className={`gem ${still ? 'gem--still' : ''} ${className}`}
      style={{
        '--gem-w': `${size}px`,
        '--gem-ratio': g.ratio,
        '--gem-clip': g.clip,
        ...(delay ? { animationDelay: `${delay}s` } : {}),
      }}
      aria-hidden="true"
    >
      <svg viewBox={g.vb} preserveAspectRatio="none" className="gem__svg">
        {g.tris.map((t, i) => (
          <polygon
            key={i}
            points={t.pts}
            fill={t.fill}
            stroke="rgba(8,8,24,0.32)"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        ))}
        {g.veins.map((v, i) => (
          <polyline
            key={i}
            points={v.pts}
            fill="none"
            stroke={v.stroke}
            strokeWidth={v.sw}
            opacity={v.op}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span className="gem__mask">
        <span className="gem__gleam" />
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------ cluster
   Tier-specific satellites around a main stone: fragment shapes, tilts and
   drift delays per tier, plus escalating effects — gold glints, amethyst
   chained arcs, diamond twinkling stars, garnet void-beams. */

const frag = (shape, size, delay, wrap) => ({ shape, size, delay, wrap })
const side = (mb, o, r) => ({ display: 'block', marginBottom: mb, opacity: o, transform: `rotate(${r}deg)` })
const chip = (pos, o, r) => ({ position: 'absolute', ...pos, opacity: o, transform: `rotate(${r}deg)` })

const CLUSTERS = {
  bronze: {
    f1: frag('hex', 15, -1.4, side(18, 0.7, -24)),
    f2: frag('dagger', 20, -3.1, side(14, 0.8, 18)),
    f3: frag('octa', 8, -0.6, chip({ left: '20%', top: 6 }, 0.5, 40)),
    f4: frag('kite', 9, -4.2, chip({ right: '16%', top: -10 }, 0.55, -14)),
  },
  silver: {
    f1: frag('dagger', 18, -2.6, side(28, 0.75, -10)),
    f2: frag('kite', 22, -4.4, side(8, 0.85, 26)),
    f3: frag('star8', 9, -1.8, chip({ left: '12%', top: -4 }, 0.5, -32)),
    f4: frag('hex', 8, -3.5, chip({ right: '22%', top: 10 }, 0.55, 52)),
  },
  gold: {
    fx: 'gold',
    f1: frag('spire', 19, -3.8, side(20, 0.75, 14)),
    f2: frag('hex', 21, -1.2, side(16, 0.8, -22)),
    f3: frag('kite', 8, -2.9, chip({ left: '17%', top: -12 }, 0.55, 60)),
    f4: frag('dagger', 9, -0.4, chip({ right: '12%', top: 2 }, 0.5, -40)),
  },
  sapphire: {
    f1: frag('kite', 17, -2.2, side(24, 0.75, -16)),
    f2: frag('star8', 25, -3.7, side(10, 0.85, 12)),
    f3: frag('kite', 9, -1.1, chip({ left: '15%', top: -8 }, 0.55, 24)),
    f4: frag('octa', 8, -4.6, chip({ right: '13%', top: 4 }, 0.5, -30)),
  },
  amethyst: {
    fx: 'amethyst',
    f1: frag('bloom', 20, -4.1, side(12, 0.8, -28)),
    f2: frag('spire', 18, -1.6, side(26, 0.7, 20)),
    f3: frag('dagger', 9, -3.3, chip({ left: '24%', top: -14 }, 0.5, -48)),
    f4: frag('star8', 8, -0.9, chip({ right: '20%', top: 12 }, 0.55, 36)),
  },
  diamond: {
    fx: 'diamond',
    f1: frag('octa', 22, -0.8, side(16, 0.8, 22)),
    f2: frag('kite', 16, -2.4, side(30, 0.7, -18)),
    f3: frag('hex', 8, -4.9, chip({ left: '11%', top: 2 }, 0.55, -56)),
    f4: frag('spire', 10, -1.9, chip({ right: '18%', top: -12 }, 0.5, 28)),
  },
  garnet: {
    fx: 'garnet',
    f1: frag('star8', 18, -3.0, side(22, 0.75, 30)),
    f2: frag('bloom', 19, -0.5, side(12, 0.8, -12)),
    f3: frag('spire', 9, -2.1, chip({ left: '19%', top: -6 }, 0.5, -20)),
    f4: frag('kite', 8, -4.0, chip({ right: '24%', top: 8 }, 0.55, 64)),
  },
}

function Twinkle({ fill, style, d = 'M6 0 L7 5 L12 6 L7 7 L6 12 L5 7 L0 6 L5 5 Z' }) {
  return (
    <svg viewBox="0 0 12 12" className="gemfx gemfx--twinkle" style={style} aria-hidden="true">
      <path d={d} fill={fill} />
    </svg>
  )
}

function GoldGlints() {
  const d = 'M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z'
  return (
    <>
      <Twinkle d={d} fill="#ffce5c" style={{ left: '8%', top: '22%', width: 11, height: 11, animationDuration: '3.4s' }} />
      <Twinkle d={d} fill="#fff4c2" style={{ right: '6%', top: '56%', width: 8, height: 8, animationDuration: '4.2s', animationDelay: '-1.9s' }} />
    </>
  )
}

function DiamondTwinkles() {
  return (
    <>
      <Twinkle fill="#7cf0d8" style={{ left: '10%', top: '14%', width: 12, height: 12, animationDuration: '3s' }} />
      <Twinkle fill="#b7d8ff" style={{ right: '8%', top: '30%', width: 9, height: 9, animationDuration: '4.1s', animationDelay: '-1.4s' }} />
      <Twinkle fill="#ffffff" style={{ left: '30%', bottom: '2%', width: 8, height: 8, animationDuration: '3.6s', animationDelay: '-2.6s' }} />
      <Twinkle fill="#8fc2ff" style={{ right: '20%', top: '2%', width: 10, height: 10, animationDuration: '3.3s', animationDelay: '-0.8s' }} />
      <Twinkle fill="#7cf0d8" style={{ left: '4%', top: '58%', width: 8, height: 8, animationDuration: '4.5s', animationDelay: '-3.2s' }} />
    </>
  )
}

/* Chained lightning that snaps around the amethyst for a frame or two. */
const ARCS = [
  { pts: '11,45 19,42 17,49 27,46 25,52 35,50 33,55 45,51', tint: 'rgba(183,176,255,0.5)', glow: 'rgba(183,176,255,0.9)', delay: '0s' },
  { pts: '45,44 40,36 44,30 37,24 41,17 34,10 36,4', tint: 'rgba(183,176,255,0.5)', glow: 'rgba(183,176,255,0.9)', delay: '0.07s' },
  { pts: '126,52 118,49 120,55 111,51 113,58 103,54 105,48 95,50', tint: 'rgba(255,156,231,0.5)', glow: 'rgba(255,156,231,0.9)', delay: '2s' },
  { pts: '94,42 100,35 96,28 104,22 100,16 111,15', tint: 'rgba(255,156,231,0.5)', glow: 'rgba(255,156,231,0.9)', delay: '2.07s' },
]

function AmethystArcs() {
  return (
    <svg viewBox="0 0 140 110" preserveAspectRatio="none" className="gemfx gemfx--arcs" aria-hidden="true">
      {ARCS.map((a, i) => (
        <g
          key={i}
          className="gemfx--arc"
          style={{ animationDelay: a.delay, filter: `drop-shadow(0 0 3px ${a.glow})` }}
        >
          <polyline points={a.pts} fill="none" stroke={a.tint} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={a.pts} fill="none" stroke="#ffffff" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  )
}

/* Void-beams that rain down around the garnet. */
const BEAMS = [
  { left: '22%', top: '-8%', width: 4, height: '74%', hue: '255,77,109', peak: 0.9, shadow: 0.7, dur: '3.1s', delay: '0s' },
  { left: '33%', top: '4%', width: 2.5, height: '52%', hue: '255,122,162', peak: 0.85, shadow: 0.7, dur: '4.3s', delay: '1.3s' },
  { left: '42%', top: '-14%', width: 1.5, height: '40%', hue: '255,122,162', peak: 0.75, shadow: 0.5, dur: '2.3s', delay: '0.6s' },
  { right: '32%', top: '-4%', width: 3, height: '66%', hue: '255,77,109', peak: 0.9, shadow: 0.7, dur: '3.7s', delay: '2.2s' },
  { right: '21%', top: '8%', width: 2, height: '48%', hue: '255,122,162', peak: 0.8, shadow: 0.6, dur: '4.9s', delay: '3.4s' },
]

function GarnetBeams() {
  return (
    <>
      {BEAMS.map((b, i) => (
        <span
          key={i}
          className="gemfx gemfx--beam"
          style={{
            left: b.left, right: b.right, top: b.top, width: b.width, height: b.height,
            background: `linear-gradient(180deg, rgba(${b.hue},0), rgba(${b.hue},${b.peak}) 30%, rgba(${b.hue},0))`,
            boxShadow: `0 0 6px rgba(${b.hue},${b.shadow})`,
            animationDuration: b.dur, animationDelay: b.delay,
          }}
        />
      ))}
    </>
  )
}

/**
 * The hero arrangement: a main stone with four satellite fragments on their
 * own tilts and drift delays, a hairline ellipse squeezing beneath, and the
 * tier's own weather around it.
 */
export default function Crystal({ size = 62, tone = 'sapphire' }) {
  const key = CLUSTERS[tone] ? tone : 'sapphire'
  const c = CLUSTERS[key]
  const k = size / 62
  const scaled = (f) => Math.max(6, Math.round(f.size * k))
  return (
    <div className="relative flex items-end justify-center gap-4 py-2" aria-hidden="true">
      <span style={c.f1.wrap}>
        <Shard size={scaled(c.f1)} tone={key} shape={c.f1.shape} delay={c.f1.delay} />
      </span>
      <span className="relative block">
        <Shard size={size} tone={key} />
        <span className="gem__shadow" />
      </span>
      <span style={c.f2.wrap}>
        <Shard size={scaled(c.f2)} tone={key} shape={c.f2.shape} delay={c.f2.delay} />
      </span>
      <span style={c.f3.wrap}>
        <Shard size={scaled(c.f3)} tone={key} shape={c.f3.shape} delay={c.f3.delay} />
      </span>
      <span style={c.f4.wrap}>
        <Shard size={scaled(c.f4)} tone={key} shape={c.f4.shape} delay={c.f4.delay} />
      </span>
      {c.fx === 'gold' && <GoldGlints />}
      {c.fx === 'amethyst' && <AmethystArcs />}
      {c.fx === 'diamond' && <DiamondTwinkles />}
      {c.fx === 'garnet' && <GarnetBeams />}
    </div>
  )
}
