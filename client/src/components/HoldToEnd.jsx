import { useEffect, useRef, useState } from 'react'

const HOLD_MS = 1200

/**
 * Ending a run must survive sweaty thumbs and a bouncing screen, so it is a
 * real press-and-hold: nothing happens until the bar fills. Enter and Space
 * hold it the same way.
 */
export default function HoldToEnd({ onDone, label = 'Hold to end', variant = 'outline', className = '' }) {
  const [pct, setPct] = useState(0)
  const timerRef = useRef(null)

  const stop = () => {
    clearInterval(timerRef.current)
    timerRef.current = null
    setPct(0)
  }
  const start = () => {
    if (timerRef.current) return
    const t0 = Date.now()
    timerRef.current = setInterval(() => {
      const next = Math.min(100, ((Date.now() - t0) / HOLD_MS) * 100)
      setPct(next)
      if (next >= 100) {
        stop()
        onDone()
      }
    }, 50)
  }
  useEffect(() => () => clearInterval(timerRef.current), [])

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        if (!e.repeat) start()
      }}
      onKeyUp={(e) => (e.key === 'Enter' || e.key === ' ') && stop()}
      onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`btn btn-${variant} relative select-none overflow-hidden touch-none ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 transition-none ${variant === 'primary' ? 'bg-garnet/70' : 'bg-garnet/20'}`}
        style={{ width: `${pct}%` }}
      />
      <span className="relative">{label}</span>
    </button>
  )
}
