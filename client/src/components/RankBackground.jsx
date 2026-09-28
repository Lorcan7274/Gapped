import { useEffect, useSyncExternalStore } from 'react'
import { useTheme } from '../lib/theme.js'
import { rankBackground, scrimGradient } from '../lib/rankBackground.js'

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
const subscribeMotion = (fn) => {
  reducedMotion?.addEventListener('change', fn)
  return () => reducedMotion?.removeEventListener('change', fn)
}

/**
 * The live field behind Home, cut for the runner's tier. Both veils are
 * always mounted and crossfade on a theme change, while the shader eases its
 * own palette across in its render loop — so dark ↔ light is one smooth move
 * rather than a swap. Reduced motion freezes the field on its first frame.
 *
 * The header and page above it are positioned but take no z-index, so they
 * paint over the field without forming stacking contexts — the fixed sheets
 * and overlays Home opens must still clear the tab bar.
 */
export default function RankBackground({ tier }) {
  const { dark } = useTheme()
  const still = useSyncExternalStore(subscribeMotion, () => reducedMotion?.matches ?? false)
  const cfg = rankBackground(tier)
  const palette = dark ? cfg.dark : cfg.light

  useEffect(() => {
    cfg.load?.().catch(() => {
      /* no shader: the veil over the plain tier colour still reads fine */
    })
  }, [cfg])

  const Field = cfg.element
  return (
    <div
      className="rank-bg pointer-events-none fixed inset-y-0 left-0 right-0 z-0 mx-auto max-w-[430px] overflow-hidden"
      style={{ backgroundColor: palette.bg }}
      aria-hidden="true"
    >
      {Field ? (
        <Field
          colors={palette.colors}
          grain={String(palette.grain)}
          speed={String(still ? 0 : cfg.speed)}
          res={String(cfg.res)}
          style={{ position: 'absolute', inset: `${cfg.inset}px`, filter: `blur(${cfg.blur}px)` }}
        />
      ) : (
        <>
          <BronzeField palette={cfg.dark} shown={dark} />
          <BronzeField palette={cfg.light} shown={!dark} />
        </>
      )}
      {Field && (
        <>
          <span className="rank-bg__veil" style={{ background: scrimGradient(cfg.dark), opacity: dark ? 1 : 0 }} />
          <span className="rank-bg__veil" style={{ background: scrimGradient(cfg.light), opacity: dark ? 0 : 1 }} />
        </>
      )}
    </div>
  )
}

/** Bronze is plain CSS: a wandering ember glow over a fine 18px grid. */
function BronzeField({ palette, shown }) {
  return (
    <span className="rank-bg__veil overflow-hidden" style={{ opacity: shown ? 1 : 0 }}>
      <span
        className="rank-bg__ember"
        style={{ background: `radial-gradient(circle 560px at 50% 240px, ${palette.glow}, transparent)` }}
      />
      <span
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, ${palette.grid} 1px, transparent 1px), linear-gradient(to bottom, ${palette.grid} 1px, transparent 1px)`,
          backgroundSize: '18px 18px',
          filter: 'blur(0.5px)',
        }}
      />
      <span className="absolute inset-0" style={{ background: scrimGradient(palette) }} />
    </span>
  )
}
