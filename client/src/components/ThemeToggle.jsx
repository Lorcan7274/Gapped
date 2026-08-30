import { useTheme } from '../lib/theme.js'

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

/**
 * The light/dark switch: a hairline pill whose knob carries a sun. Flipping
 * it slides the knob across while the rays draw in and a second disc, the
 * colour of the knob, slips over the sun to leave a crescent. The switch
 * itself is small; the hit area is the usual 56px.
 */
export default function ThemeToggle({ className = '' }) {
  const { dark, toggle } = useTheme()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      onClick={toggle}
      className={`theme-toggle ${dark ? 'is-dark' : ''} ${className}`}
    >
      <span className="theme-toggle__track">
        <span className="theme-toggle__knob">
          <svg viewBox="0 0 24 24" className="theme-toggle__icon" aria-hidden="true">
            <g className="theme-toggle__rays">
              {RAY_ANGLES.map((angle) => (
                <line
                  key={angle}
                  x1="12" y1="1.4" x2="12" y2="3.9"
                  transform={`rotate(${angle} 12 12)`}
                />
              ))}
            </g>
            <circle className="theme-toggle__sun" cx="12" cy="12" r="4.6" />
            <circle className="theme-toggle__bite" cx="12" cy="12" r="4.6" />
          </svg>
        </span>
      </span>
    </button>
  )
}
