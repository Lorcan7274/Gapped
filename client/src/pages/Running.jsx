import { useEffect } from 'react'
import { run, useRun } from '../lib/run.js'
import { useSession } from '../state/session.jsx'
import { useWakeLock } from '../lib/wakeLock.js'
import { clock } from '../lib/format.js'
import HoldToEnd from '../components/HoldToEnd.jsx'
import { Button, Label, Spinner } from '../components/ui.jsx'

const paceClock = (msPerKm) => (msPerKm && Number.isFinite(msPerKm) ? clock(msPerKm) : '—:—')

const GPS_TEXT = {
  waiting: 'Finding GPS…',
  blocked: 'Location is blocked. Allow it for this site to record.',
  unavailable: 'No GPS fix yet. Head outside.',
}

/**
 * A solo run in progress, then its payout. Must read at arm's length in
 * sunlight: distance first, then the clock, then pace. Everything here comes
 * from the run store; this screen holds no run state of its own.
 */
export default function Running() {
  const state = useRun()
  const { updatePlayer } = useSession()
  useWakeLock(state.phase === 'running')

  // The server's record of the player comes back with the saved run.
  useEffect(() => {
    if (state.phase === 'done' && state.result?.player) updatePlayer(state.result.player)
  }, [state.phase, state.result, updatePlayer])

  if (state.phase === 'saving') {
    return (
      <Frame>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Spinner />
          <Label>Saving your run</Label>
        </div>
      </Frame>
    )
  }

  if (state.phase === 'error') {
    return (
      <Frame>
        <div className="flex flex-1 flex-col justify-center gap-3">
          <Label className="text-garnet">Run not saved</Label>
          <p className="text-[17px] leading-relaxed">{state.error}</p>
        </div>
        <div className="flex flex-col gap-2 pb-2">
          {state.retryable && <Button onClick={() => run.retry()}>Try again</Button>}
          <Button variant="quiet" onClick={() => run.dismiss()}>
            {state.retryable ? 'Later' : 'Close'}
          </Button>
        </div>
      </Frame>
    )
  }

  if (state.phase === 'done') return <RunResult result={state.result} />

  const km = (state.metres / 1000).toFixed(2)
  return (
    <Frame>
      <header className="flex items-center justify-between border-b border-rule pb-4">
        <span className="label text-ink">Solo run{state.private ? ' · private' : ''}</span>
        <span className={`label ${state.gps === 'ok' ? 'text-muted' : 'text-garnet'}`}>
          {state.gps === 'ok' ? 'GPS' : 'No GPS'}
        </span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="display display-tight nums text-[112px]">{km}</p>
        <p className="display text-[40px]">km</p>
        {state.gps !== 'ok' && (
          <p className="mt-6 max-w-[16rem] text-center text-[15px] text-garnet">{GPS_TEXT[state.gps]}</p>
        )}
      </div>

      <div className="flex items-baseline justify-between border-t border-rule pt-4">
        <Label>Time</Label>
        <p className="display nums text-[64px]">{clock(state.elapsedMs)}</p>
      </div>
      <div className="border-t border-rule pt-4">
        <div className="flex items-end justify-between pb-4">
          <div>
            <Label>Pace /km</Label>
            <p className="display nums mt-1.5 text-[32px]">{paceClock(state.paceMsPerKm)}</p>
          </div>
          <div className="text-right">
            <Label>GPS fixes</Label>
            <p className="display nums mt-1.5 text-[32px]">{state.fixes}</p>
          </div>
        </div>
        <HoldToEnd label="Hold to finish" onDone={() => run.finish()} />
      </div>
    </Frame>
  )
}

function Frame({ children }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper px-6 safe-t safe-b">{children}</div>
  )
}

/** What the run paid. A flagged run says so plainly, and pays nothing yet. */
function RunResult({ result }) {
  const saved = result?.run
  if (!saved) return null
  const quarantined = saved.status === 'quarantined'
  const km = (saved.distanceM / 1000).toFixed(2)
  const streak = result.player?.streak ?? 0

  return (
    <Frame>
      <div className="flex flex-1 flex-col justify-center">
        <Label>{quarantined ? 'Run saved' : 'Run done'}</Label>
        <p className="display nums mt-2 text-[72px]">{km}<span className="text-[32px]"> km</span></p>
        <p className="nums mt-1 text-[17px] text-slate">{clock(saved.elapsedMs)}</p>

        {quarantined ? (
          <p className="mt-8 border-t border-rule pt-4 text-[15px] leading-relaxed text-slate">
            Something about this run looked off, so it will not count until it has been
            checked. You have lost nothing.
          </p>
        ) : (
          <div className="mt-8 border-t border-rule">
            <Payout label="Shards" value={saved.shards} hint={saved.shards === 0 ? 'Runs under 10 minutes do not grow the crystal' : null} />
            <Payout label="Fuel" value={saved.fuel} />
            <Payout label="Points this week" value={saved.points} />
            {streak > 0 && <Payout label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} plain />}
          </div>
        )}
      </div>
      <div className="pb-2">
        <Button onClick={() => run.dismiss()}>Done</Button>
      </div>
    </Frame>
  )
}

function Payout({ label, value, hint = null, plain = false }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-4 border-b border-rule py-2">
      <div>
        <span className="text-[15px]">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </div>
      <span className="display nums text-[28px]">{plain ? value : `+${value}`}</span>
    </div>
  )
}
