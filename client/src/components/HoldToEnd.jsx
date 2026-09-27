import { useEffect, useRef, useState } from 'react'

const HOLD_MS = 1200

/**
 * Ending a run must survive sweaty thumbs and a bouncing screen, so it is a
 * real press-and-hold: nothing happens until the bar fills.
 */
export default function HoldToEnd({ onDone, label = 'Hold to end' }) {
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
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDone()}
      onContextMenu={(e) => e.preventDefault()}
      className="btn btn-outline relative select-none overflow-hidden touch-none"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-garnet/20 transition-none"
        style={{ width: `${pct}%` }}
      />
      <span className="relative">{label}</span>
    </button>
  )
}
