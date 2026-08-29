import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { createTracker } from '../lib/tracker.js'
import { metres, distanceLabel, preciseClock, pace } from '../lib/format.js'
import { Button, TierBadge } from '../components/ui.jsx'

// How often we push our position to the opponent.
const REPORT_INTERVAL_MS = 1000

export default function Battle() {
  const { match, send, opponentProgress, opponentFinished } = useSession()

  const [phase, setPhase] = useState('countdown')
  const [countdown, setCountdown] = useState(null)
  const [mine, setMine] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [quality, setQuality] = useState('waiting')
  const [gpsError, setGpsError] = useState(null)

  const trackerRef = useRef(null)
  const startedAtRef = useRef(null)
  const lastReportRef = useRef(0)
  const finishedRef = useRef(false)

  /* ------------------------------------------------------------- countdown */

  useEffect(() => {
    if (!match) return
    const tick = () => {
      const remaining = match.startsAt - Date.now()
      if (remaining <= 0) {
        setCountdown(0)
        setPhase('running')
        return true
      }
      setCountdown(Math.ceil(remaining / 1000))
      return false
    }
    if (tick()) return
    const timer = setInterval(() => {
      if (tick()) clearInterval(timer)
    }, 100)
    return () => clearInterval(timer)
  }, [match])

  /* ---------------------------------------------------------------- timing */

  useEffect(() => {
    if (phase !== 'running') return
    startedAtRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 100)
    return () => clearInterval(timer)
  }, [phase])

  /* --------------------------------------------------------------- tracking */

  useEffect(() => {
    if (phase !== 'running' || !match) return

    const tracker = createTracker({
      onUpdate: ({ metres: run, quality: q }) => {
        setQuality(q)
        setMine(run)

        if (finishedRef.current) return

        const now = Date.now()
        if (run >= match.distanceM) {
          finishedRef.current = true
          send('match:finish', {
            matchId: match.id,
            elapsedMs: now - startedAtRef.current,
          })
          setPhase('done')
          return
        }
        if (now - lastReportRef.current >= REPORT_INTERVAL_MS) {
          lastReportRef.current = now
          send('match:progress', {
            matchId: match.id,
            progressM: run,
            elapsedMs: now - startedAtRef.current,
          })
        }
      },
      onError: (err) =>
        setGpsError(
          err.code === 1
            ? 'Location permission is off. Gap cannot score the race without it.'
            : 'Lost the GPS signal. Keep going — we are still trying.'
        ),
    })

    trackerRef.current = tracker
    tracker.start()
    return () => {
      tracker.stop()
      trackerRef.current = null
    }
  }, [phase, match, send])

  const mineFraction = useMemo(
    () => (match ? Math.min(1, mine / match.distanceM) : 0),
    [mine, match]
  )
  const theirsFraction = useMemo(
    () => (match ? Math.min(1, opponentProgress / match.distanceM) : 0),
    [opponentProgress, match]
  )

  if (!match) return null

  const gap = mine - opponentProgress
  const leading = gap > 0

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950 px-5 safe-top safe-bottom">
      <header className="flex items-center justify-between py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-400">
            Head to head
          </p>
          <h2 className="nums text-xl font-black">
            {distanceLabel(match.distanceM)} race
          </h2>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-400">
            vs
          </p>
          <div className="flex items-center gap-2">
            <span className="font-bold">{match.opponent.displayName}</span>
            <TierBadge tier={match.opponent.tier} />
          </div>
        </div>
      </header>

      {phase === 'countdown' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="nums text-[8rem] font-black leading-none text-surge-400">
            {countdown ?? '—'}
          </span>
          <p className="text-ink-400">Get to the line.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col justify-center gap-8">
            <div className="text-center">
              <p className="nums text-7xl font-black leading-none tracking-tighter">
                {preciseClock(elapsedMs)}
              </p>
              <p className="nums mt-2 text-sm text-ink-400">
                {pace(elapsedMs, mine)} · {metres(mine)} of{' '}
                {distanceLabel(match.distanceM)}
              </p>
            </div>

            {/* The gap. This is the whole product in one number. */}
            <div className="text-center">
              <p
                className={`nums text-5xl font-black tracking-tight ${
                  leading ? 'text-surge-400' : 'text-flare-400'
                }`}
              >
                {leading ? '+' : ''}
                {Math.round(gap)} m
              </p>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-ink-400">
                {opponentFinished
                  ? `${match.opponent.displayName} has finished`
                  : leading
                    ? 'You are ahead'
                    : 'You are behind'}
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <Lane
                label="You"
                fraction={mineFraction}
                colour="bg-surge-500"
                value={metres(mine)}
              />
              <Lane
                label={match.opponent.displayName}
                fraction={theirsFraction}
                colour="bg-flare-500"
                value={metres(opponentProgress)}
              />
            </div>
          </div>

          <footer className="flex flex-col gap-3 pb-2">
            {gpsError && (
              <p className="rounded-2xl bg-flare-500/10 px-4 py-3 text-center text-sm text-flare-400">
                {gpsError}
              </p>
            )}
            <p className="text-center text-[11px] uppercase tracking-wider text-ink-600">
              GPS {quality}
            </p>

            {import.meta.env.DEV && phase === 'running' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => trackerRef.current?.advance(50)}
              >
                Dev: advance 50 m
              </Button>
            )}

            {phase === 'done' ? (
              <p className="text-center text-sm text-ink-400">
                Finished. Waiting on the result…
              </p>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm('Forfeit this race? Your opponent takes the win.')) {
                    send('match:forfeit', { matchId: match.id })
                  }
                }}
              >
                Forfeit
              </Button>
            )}
          </footer>
        </>
      )}
    </div>
  )
}

function Lane({ label, fraction, colour, value }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs font-semibold">
        <span className="truncate text-ink-200">{label}</span>
        <span className="nums text-ink-400">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-ink-800">
        <div
          className={`h-full rounded-full ${colour} transition-[width] duration-500 ease-out`}
          style={{ width: `${Math.max(2, fraction * 100)}%` }}
        />
      </div>
    </div>
  )
}
