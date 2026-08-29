import { useEffect, useMemo, useRef, useState } from 'react'
import { createTracker, MAX_ACCURACY_M, MAX_SPEED_MPS, MIN_STEP_M } from '../lib/tracker.js'
import { Button, Label } from '../components/ui.jsx'

const paceLabel = (msPerKm) => {
  if (msPerKm == null || !Number.isFinite(msPerKm)) return '—:—'
  const total = Math.round(msPerKm / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const clock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * GPS test bench. Deliberately not linked from anywhere in the app — reach it
 * by typing /debug. Exists so the distance maths can be trusted on real
 * hardware before a duel ever depends on it.
 */
export default function Debug() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [, forceTick] = useState(0)
  const trackerRef = useRef(null)

  if (!trackerRef.current) {
    trackerRef.current = createTracker({
      // A fix arriving means whatever went wrong earlier has recovered, so
      // the error banner should not linger over a working readout.
      onUpdate: (next) => {
        setState(next)
        if (next.accepted > 0 || next.rejected > 0) setError(null)
      },
      onError: (err) =>
        setError(
          err?.code === 1
            ? 'Location permission denied. Allow it and reload.'
            : `GPS error: ${err?.message || 'unknown'}`
        ),
    })
  }
  const tracker = trackerRef.current

  // Keep the elapsed clock moving between fixes.
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => () => tracker.stop(), [tracker])

  const running = state?.running ?? false
  const total = state?.metres ?? 0
  const accepted = state?.accepted ?? 0
  const rejected = state?.rejected ?? 0
  const ratio = useMemo(
    () => (accepted + rejected > 0 ? Math.round((accepted / (accepted + rejected)) * 100) : null),
    [accepted, rejected]
  )

  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-paper px-4 py-6 safe-top safe-bottom">
      <header>
        <p className="label text-muted">
          GPS test bench
        </p>
        <h1 className="display text-[34px]">/debug</h1>
        <p className="mt-1 text-xs text-muted">
          Rejecting accuracy &gt; {MAX_ACCURACY_M} m and speed &gt; {MAX_SPEED_MPS} m/s.
          Holding steps &lt; {MIN_STEP_M} m as jitter.
        </p>
      </header>

      {error && (
        <p className="rounded-2xl border border-garnet px-4 py-3 text-sm text-garnet">{error}</p>
      )}

      {/* Total distance — the number under test */}
      <div className="border-y border-rule py-6 text-center">
        <p className="label text-muted">
          Total distance
        </p>
        <p className="display text-[76px]">
          {total.toFixed(1)}
        </p>
        <p className="nums mt-1 text-sm text-muted">metres</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border-b border-rule py-5">
          <p className="label text-muted">
            Pace (last 30 s)
          </p>
          <p className="nums text-2xl font-bold">{paceLabel(state?.paceMsPerKm)}</p>
          <p className="text-[11px] text-muted">min / km</p>
        </div>
        <div className="border-b border-rule py-5">
          <p className="label text-muted">
            Last accuracy
          </p>
          <p
            className={`nums text-2xl font-bold ${
              state?.accuracy == null
                ? 'text-muted'
                : state.accuracy > MAX_ACCURACY_M
                  ? 'text-garnet'
                  : 'text-indigo'
            }`}
          >
            {state?.accuracy == null ? '—' : `${state.accuracy.toFixed(0)} m`}
          </p>
          <p className="text-[11px] text-muted">
            {state?.lastRejection ? `rejected: ${state.lastRejection}` : 'accepted'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-rule py-5 text-center">
        <div>
          <p className="nums text-2xl font-bold text-indigo">{accepted}</p>
          <p className="label text-muted">Accepted</p>
        </div>
        <div>
          <p className="nums text-2xl font-bold text-garnet">{rejected}</p>
          <p className="label text-muted">Rejected</p>
        </div>
        <div>
          <p className="nums text-2xl font-bold">{ratio == null ? '—' : `${ratio}%`}</p>
          <p className="label text-muted">Kept</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-rule py-5 text-center">
        <div>
          <p className="nums text-lg font-bold">{clock(state?.elapsedMs ?? 0)}</p>
          <p className="label text-muted">Elapsed</p>
        </div>
        <div>
          <p className="nums text-lg font-bold text-garnet">
            {state?.rejectedAccuracy ?? 0}
          </p>
          <p className="label text-muted">Bad acc.</p>
        </div>
        <div>
          <p className="nums text-lg font-bold text-garnet">{state?.rejectedSpeed ?? 0}</p>
          <p className="label text-muted">Too fast</p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <div className="flex gap-3">
          <Button
            className="flex-1"
            variant={running ? 'ghost' : 'primary'}
            onClick={() => (running ? tracker.stop() : (setError(null), tracker.start()))}
          >
            {running ? 'Stop' : 'Start'}
          </Button>
          <Button variant="outline" onClick={() => tracker.reset()}>
            Reset
          </Button>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-muted">
          Walk a measured 100 m in a straight line with the screen on. The total
          should land within 10 % — that is 90 to 110 m.
        </p>
      </div>
    </div>
  )
}
