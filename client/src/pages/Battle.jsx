import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { createTracker } from '../lib/tracker.js'
import { Label } from '../components/ui.jsx'

const REPORT_INTERVAL_MS = 2000
const HOLD_TO_END_MS = 1200

const clock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
const paceLabel = (msPerKm) => {
  if (!msPerKm || !Number.isFinite(msPerKm)) return '—:—'
  const total = Math.round(msPerKm / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Forfeiting mid-run must survive sweaty thumbs and a bouncing screen, so it
 * is a real press-and-hold: nothing happens until the bar fills.
 */
function HoldToEnd({ onDone }) {
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
      const next = Math.min(100, ((Date.now() - t0) / HOLD_TO_END_MS) * 100)
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
      onContextMenu={(e) => e.preventDefault()}
      className="btn btn-outline relative select-none overflow-hidden touch-none"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-garnet/20 transition-none"
        style={{ width: `${pct}%` }}
      />
      <span className="relative">Hold to end</span>
    </button>
  )
}

/**
 * The hero screen. Must read at arm's length in direct sunlight, so it holds
 * the gap and nothing that competes with it.
 */
export default function Battle() {
  const { match, send, opponentProgress } = useSession()
  const [phase, setPhase] = useState('countdown')
  const [countdown, setCountdown] = useState(null)
  const [mine, setMine] = useState(match?.resumeProgressM ?? 0)
  const [pace, setPace] = useState(null)
  const [timeMs, setTimeMs] = useState(0)

  const timed = match?.mode === 'timed'
  const trackerRef = useRef(null)
  const lastReportRef = useRef(0)
  const finishedRef = useRef(false)
  const wakeLockRef = useRef(null)
  // A reload mid-duel restarts the GPS trail at zero, but the server still
  // holds the metres already run; resume on top of them instead of at 0.
  const baseRef = useRef(match?.resumeProgressM ?? 0)

  /* Screen wake lock — the phone must not sleep mid-duel. */
  useEffect(() => {
    let released = false
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && !released) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch {
        /* denied or unsupported; the duel still runs */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      wakeLockRef.current?.release?.().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!match) return
    const tick = () => {
      const left = match.startsAt - Date.now()
      if (left <= 0) {
        setPhase('running')
        return true
      }
      setCountdown(Math.ceil(left / 1000))
      return false
    }
    if (tick()) return
    const timer = setInterval(() => tick() && clearInterval(timer), 100)
    return () => clearInterval(timer)
  }, [match])

  /**
   * The duel clock, anchored to the shared start line rather than to when
   * this screen mounted, so it survives a reload. A race counts up; a timed
   * duel counts down and settles itself at zero.
   */
  useEffect(() => {
    if (phase !== 'running' || !match) return
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - match.startsAt)
      if (!timed) {
        setTimeMs(elapsed)
        return
      }
      const left = Math.max(0, match.durationMs - elapsed)
      setTimeMs(left)
      if (left <= 0 && !finishedRef.current) {
        finishedRef.current = true
        // One last report so the settle sees everything this phone measured.
        send('match:progress', {
          matchId: match.id,
          progressM: baseRef.current + (trackerRef.current?.metres ?? 0),
          elapsedMs: Math.max(1, elapsed),
        })
        setPhase('done')
      }
    }
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [phase, match, timed, send])

  useEffect(() => {
    if (phase !== 'running' || !match) return
    const tracker = createTracker({
      onUpdate: ({ metres, paceMsPerKm }) => {
        const total = baseRef.current + metres
        setMine(total)
        setPace(paceMsPerKm)
        if (finishedRef.current) return

        const now = Date.now()
        const elapsedMs = Math.max(1, now - match.startsAt)

        // Crossing the line ends a race. Reported once — the server ignores
        // anything after the match leaves 'live'. Timed duels have no line;
        // the clock effect above closes them out.
        if (!timed && match.distanceM && total >= match.distanceM) {
          finishedRef.current = true
          send('match:finish', { matchId: match.id, elapsedMs })
          setPhase('done')
          return
        }

        if (now - lastReportRef.current >= REPORT_INTERVAL_MS) {
          lastReportRef.current = now
          send('match:progress', { matchId: match.id, progressM: total, elapsedMs })
        }
      },
    })
    trackerRef.current = tracker
    tracker.start()
    return () => tracker.stop()
  }, [phase, match, timed, send])

  const gap = Math.round(mine - opponentProgress)
  const ahead = gap >= 0
  // "-23 meters behind" is a double negative. AHEAD / BEHIND carries the
  // direction, so the number is always the plain magnitude.
  const gapText = useMemo(() => String(Math.abs(gap)), [gap])

  if (!match) return null

  if (phase === 'countdown') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6">
        <p className="display text-[140px] text-ink">{countdown ?? '—'}</p>
        <Label className="mt-4">Get to the line</Label>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper px-6 safe-t safe-b">
      <header className="border-b border-rule pb-4">
        <span className="label text-ink">
          Versus {match.opponent?.displayName ?? 'Opponent'}
        </span>
      </header>

      {/* The gap. Everything else on this screen defers to it. */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <p
          className={`display display-tight text-[112px] ${
            ahead ? 'text-ink' : 'text-garnet'
          }`}
        >
          {gapText}
        </p>
        <p className={`display text-[40px] ${ahead ? 'text-ink' : 'text-garnet'}`}>
          meters
        </p>
        <p
          className="mt-4 text-[26px] font-700 uppercase"
          style={{ letterSpacing: '0.22em' }}
        >
          {ahead ? 'Ahead' : 'Behind'}
        </p>
      </div>

      {/* The clock is the second thing you look at, so it gets real size and
          sits low where a glance lands. A race counts up; a timed duel counts
          down and turns garnet inside the last 30 seconds. */}
      <div className="flex items-baseline justify-between border-t border-rule pt-4">
        <Label>{timed ? 'Time left' : 'Time'}</Label>
        <p
          className={`display text-[64px] ${
            timed && timeMs <= 30_000 ? 'text-garnet' : 'text-ink'
          }`}
        >
          {clock(timeMs)}
        </p>
      </div>

      <div className="border-t border-rule pt-4">
        <div className="flex items-end justify-between pb-4">
          <div>
            <Label>Pace</Label>
            <p className="display mt-1.5 text-[32px]">{paceLabel(pace)}</p>
          </div>
          <div className="text-right">
            <Label>Distance</Label>
            <p className="display mt-1.5 text-[32px]">{Math.round(mine)} m</p>
          </div>
        </div>
        {phase === 'done' ? (
          <p className="py-4 text-center text-[15px] text-slate">
            {timed ? 'Time. Waiting on the result…' : 'Finished. Waiting on the result…'}
          </p>
        ) : (
          <HoldToEnd onDone={() => send('match:forfeit', { matchId: match.id })} />
        )}
      </div>
    </div>
  )
}
