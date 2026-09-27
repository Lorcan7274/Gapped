import { useEffect } from 'react'
import { run, useRun } from '../lib/run.js'
import { useSession } from '../state/session.jsx'
import { useWakeLock } from '../lib/wakeLock.js'
import { clock, signedClock } from '../lib/format.js'
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

  if (state.phase === 'done') {
    return state.result?.duel || state.result?.duelClosed
      ? <LegResult result={state.result} />
      : <RunResult result={state.result} />
  }

  if (state.mode === 'duel') return <DuelLeg state={state} />

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

function Payout({ label, value, hint = null, plain = false, signed = false }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-4 border-b border-rule py-2">
      <div>
        <span className="text-[15px]">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </div>
      <span className="display nums text-[28px]">
        {plain ? value : signed && value < 0 ? `−${Math.abs(value)}` : `+${value}`}
      </span>
    </div>
  )
}

/**
 * Racing a ghost. The screen is the gap: how many metres ahead of (green) or
 * behind (garnet) the ghost you are, then how far to the line, then the
 * clock. Nothing else competes with it.
 */
function DuelLeg({ state }) {
  const { duel } = state
  const started = state.elapsedMs > 0
  const ahead = (state.gapM ?? 0) >= 0
  const gap = Math.round(Math.abs(state.gapM ?? 0))
  const toGo = Math.max(0, duel.distanceM - state.metres)
  const name = duel.opponent?.displayName ?? 'them'

  return (
    <Frame>
      <header className="flex items-center justify-between border-b border-rule pb-4">
        <span className="label text-ink">{duel.leg === 1 ? `Duel · ${name}’s ghost` : `Reply · ${name}’s run`}</span>
        <span className={`label ${state.gps === 'ok' ? 'text-muted' : 'text-garnet'}`}>
          {state.gps === 'ok' ? 'GPS' : 'No GPS'}
        </span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center">
        {started ? (
          <>
            <p className={`display display-tight nums text-[112px] ${ahead ? 'text-win' : 'text-garnet'}`}>
              {ahead ? '+' : '−'}{gap}
            </p>
            <p className={`display text-[32px] ${ahead ? 'text-win' : 'text-garnet'}`}>
              m {ahead ? 'ahead' : 'behind'}
            </p>
          </>
        ) : (
          <p className="max-w-[16rem] text-center text-[17px] text-slate">
            {state.gps === 'ok' || state.gps === 'waiting'
              ? 'Waiting for a good GPS fix. The race starts the moment you have one.'
              : GPS_TEXT[state.gps]}
          </p>
        )}
      </div>

      <div className="flex items-baseline justify-between border-t border-rule pt-4">
        <Label>To go</Label>
        <p className="display nums text-[48px]">{(toGo / 1000).toFixed(2)}<span className="text-[24px]"> km</span></p>
      </div>
      <div className="border-t border-rule pt-4">
        <div className="flex items-end justify-between pb-4">
          <div>
            <Label>Time</Label>
            <p className="display nums mt-1.5 text-[32px]">{clock(state.elapsedMs)}</p>
          </div>
          <div className="text-right">
            <Label>Their time</Label>
            <p className="display nums mt-1.5 text-[32px]">{clock(duel.ghostTimeMs)}</p>
          </div>
        </div>
        <HoldToEnd label="Hold to quit" onDone={() => run.finish({ quit: true })} />
        <p className="pt-2 text-center text-[13px] text-muted">Quitting counts as losing by the expected margin.</p>
      </div>
    </Frame>
  )
}

const HEADLINE = { won: 'Victory', lost: 'Defeat', tie: 'Dead heat' }

/** How a duel leg went: the challenge sent, or the duel decided. */
function LegResult({ result }) {
  const { run: saved, duel } = result
  if (!saved) return null
  const name = duel?.opponent?.displayName ?? 'Your opponent'
  let body
  if (!duel) {
    body = (
      <>
        <Label>Run saved</Label>
        <p className="display mt-2 text-[40px]">Counted as solo</p>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          That duel had already settled, so this run paid as a solo run.
        </p>
      </>
    )
  } else if (duel.status === 'void') {
    body = (
      <>
        <Label>Duel off</Label>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          Something about this run looked off, so the duel will not count. Nobody
          gains or loses anything{duel.role === 'challenger' ? ', and your Fuel is back' : ''}.
        </p>
      </>
    )
  } else if (duel.status === 'awaiting') {
    const lead = duel.ghostMs - duel.legs.challenger.ms
    body = (
      <>
        <Label>Challenge sent</Label>
        <p className={`display nums mt-2 text-[64px] ${lead >= 0 ? 'text-win' : 'text-garnet'}`}>
          {signedClock(lead)}
        </p>
        <p className="mt-1 text-[17px] text-slate">
          {lead >= 0 ? `ahead of ${name}’s ghost` : `behind ${name}’s ghost`} · {clock(duel.legs.challenger.ms)}
        </p>
        <p className="mt-6 text-[15px] leading-relaxed text-slate">
          {name} races your run back. They have until Sunday night — ignore it and
          the points are yours.
        </p>
      </>
    )
  } else if (duel.result?.you === 'quit') {
    body = (
      <>
        <Label>Duel withdrawn</Label>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          You quit before the line, so the challenge never went to {name}.
        </p>
      </>
    )
  } else {
    body = <DuelOutcome duel={duel} />
  }

  return (
    <Frame>
      <div className="flex flex-1 flex-col justify-center">
        {body}
        {saved.status !== 'quarantined' && (
          <div className="mt-8 border-t border-rule">
            {duel?.result && <Payout label="Points this week" value={duel.result.points} signed />}
            <Payout label="Shards" value={saved.shards} />
            <Payout label="Fuel" value={saved.fuel} />
          </div>
        )}
      </div>
      <div className="pb-2">
        <Button onClick={() => run.dismiss()}>Done</Button>
      </div>
    </Frame>
  )
}

/** A decided duel: who won on the combined margin, and each leg. */
export function DuelOutcome({ duel }) {
  const { you, marginMs } = duel.result
  const name = duel.opponent?.displayName ?? 'them'
  const tone = you === 'won' ? 'text-win' : you === 'lost' ? 'text-garnet' : 'text-muted'
  return (
    <>
      <Label>Duel · {name}</Label>
      <p className={`display mt-2 text-[64px] ${tone}`}>{HEADLINE[you] ?? 'Settled'}</p>
      {duel.result.outcome === 'walkover' ? (
        <p className="mt-1 text-[17px] text-slate">
          {you === 'won' ? `${name} never replied.` : `You did not reply by Sunday.`}
        </p>
      ) : (
        marginMs != null && (
          <p className="nums mt-1 text-[17px] text-slate">
            {signedClock(marginMs)} over both legs
          </p>
        )
      )}
    </>
  )
}
