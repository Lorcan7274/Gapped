import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { createTracker } from '../lib/tracker.js'
import { Button, Label } from '../components/ui.jsx'

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
 * The hero screen. Must read at arm's length in direct sunlight, so it holds
 * the gap and nothing that competes with it.
 */
export default function Battle() {
  const { match, send, opponentProgress } = useSession()
  const [phase, setPhase] = useState('countdown')
  const [countdown, setCountdown] = useState(null)
  const [mine, setMine] = useState(0)
  const [pace, setPace] = useState(null)
  const [remainingMs, setRemainingMs] = useState(0)

  const trackerRef = useRef(null)
  const startedAtRef = useRef(null)
  const lastReportRef = useRef(0)
  const wakeLockRef = useRef(null)

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

  useEffect(() => {
    if (phase !== 'running' || !match) return
    startedAtRef.current = Date.now()
    const durationMs = (match.durationMs ?? 10 * 60_000)
    const timer = setInterval(() => {
      setRemainingMs(durationMs - (Date.now() - startedAtRef.current))
    }, 250)
    return () => clearInterval(timer)
  }, [phase, match])

  useEffect(() => {
    if (phase !== 'running' || !match) return
    const tracker = createTracker({
      onUpdate: ({ metres, paceMsPerKm }) => {
        setMine(metres)
        setPace(paceMsPerKm)
        const now = Date.now()
        if (now - lastReportRef.current >= REPORT_INTERVAL_MS) {
          lastReportRef.current = now
          send('match:progress', {
            matchId: match.id,
            progressM: metres,
            elapsedMs: now - startedAtRef.current,
          })
        }
      },
    })
    trackerRef.current = tracker
    tracker.start()
    return () => tracker.stop()
  }, [phase, match, send])

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

      {/* Time remaining sat in the header at label size and was unreadable
          mid-run. It is the second thing you look at, so it gets real size
          and sits low where a glance lands. */}
      <div className="flex items-baseline justify-between border-t border-rule pt-4">
        <Label>Time left</Label>
        <p
          className={`display text-[64px] ${
            remainingMs <= 30_000 ? 'text-garnet' : 'text-ink'
          }`}
        >
          {clock(remainingMs)}
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
        <Button
          variant="outline"
          onClick={() => {
            if (confirm('End this duel? Your opponent takes the win.')) {
              send('match:forfeit', { matchId: match.id })
            }
          }}
        >
          Hold to end
        </Button>
      </div>
    </div>
  )
}
