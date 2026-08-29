/**
 * The faceted sapphire. Pure CSS: a clipped hexagonal silhouette with six
 * overlaid facet polygons faking cut faces, two bright slivers down the
 * spine, and a skewed bar of light sweeping across on a slow gleam.
 *
 * The only non-typographic element in the app. Scales by `size` alone —
 * every facet is expressed in percentages.
 */
export function Shard({ size = 78, tone = 'sapphire', still = false, className = '' }) {
  return (
    <span
      className={`gem ${tone === 'garnet' ? 'gem--garnet' : ''} ${
        still ? 'gem--still' : ''
      } ${className}`}
      style={{ '--gem-w': `${size}px` }}
      aria-hidden="true"
    >
      <span className="gem__face gem__base" />
      <span className="gem__face gem__f1" />
      <span className="gem__face gem__f2" />
      <span className="gem__face gem__f3" />
      <span className="gem__face gem__f4" />
      <span className="gem__face gem__f5" />
      <span className="gem__face gem__f6" />
      <span className="gem__face">
        <span className="gem__sliver gem__sliver--a" />
        <span className="gem__sliver gem__sliver--b" />
        <span className="gem__gleam" />
      </span>
    </span>
  )
}

/**
 * The hero arrangement: the main stone flanked by two smaller companions on
 * their own delays, with a hairline ellipse beneath that squeezes in sync.
 */
export default function Crystal({ size = 78, tone = 'sapphire' }) {
  return (
    <div className="relative flex items-end justify-center gap-3 py-2">
      <Shard size={size * 0.3} tone={tone} className="mb-5 opacity-70 [animation-delay:-2.2s]" />
      <div className="relative">
        <Shard size={size} tone={tone} />
        <span className="gem__shadow" />
      </div>
      <Shard size={size * 0.42} tone={tone} className="mb-3 opacity-80 [animation-delay:-3.7s]" />
    </div>
  )
}
