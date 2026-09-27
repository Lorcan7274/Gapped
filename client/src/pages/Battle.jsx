import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { createTracker } from '../lib/tracker.js'
import { Label } from '../components/ui.jsx'
import HoldToEnd from '../components/HoldToEnd.jsx'
import { useWakeLock } from '../lib/wakeLock.js'

const REPORT_INTERVAL_MS = 2000

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
 * A live friend duel. Must read at arm's length in direct sunlight, so it
 * holds the gap and nothing that competes with it: green ahead, garnet behind.
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
  // A reload mid-duel restarts the GPS trail at zero, but the server still
  // holds the metres already run; resume on top of them instead of at 0.
  const baseRef = useRef(match?.resumeProgressM ?? 0)

  useWakeLock()

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
      <header className="flex items-center justify-between border-b border-rule pb-4">
        <span className="label text-ink">
          Versus {match.opponent?.displayName ?? 'Opponent'}
        </span>
      </header>

      {/* The gap. Everything else on this screen defers to it. */}
      <div className="relative flex flex-1 flex-col items-center justify-center">
        <p
          className={`display display-tight text-[112px] ${
            ahead ? 'text-win' : 'text-garnet'
          }`}
        >
          {gapText}
        </p>
        <p className={`display text-[40px] ${ahead ? 'text-win' : 'text-garnet'}`}>
          metres
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
