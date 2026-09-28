import { useEffect } from 'react'
import { run, useRun } from '../lib/run.js'
import { useSession } from '../state/session.jsx'
import { useWakeLock } from '../lib/wakeLock.js'
import { clock, signedClock } from '../lib/format.js'
import HoldToEnd from '../components/HoldToEnd.jsx'
import RunMap from '../components/RunMap.jsx'
import { Button, Label, Spinner } from '../components/ui.jsx'

const averagePace = ({ elapsedMs, metres }) => (metres >= 50 ? (elapsedMs / metres) * 1000 : null)
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

  return <Live state={state} />
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
          The week ended before {name} could reply, so the duel will not count.
          Nobody gains or loses anything{duel.role === 'challenger' ? ', and your Fuel is back' : ''}.
        </p>
      </>
    )
  } else if (duel.role === 'challenger' && (duel.status === 'awaiting' || duel.status === 'leg2')) {
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
          {duel.status === 'leg2'
            ? `${name} is racing your run back now.`
            : `${name} races your run back. They have until Sunday night — ignore it and the points are yours.`}
        </p>
      </>
    )
  } else if (!duel.result) {
    // Only reachable on a re-sent run whose duel has moved on without it.
    body = (
      <>
        <Label>Run saved</Label>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          Your leg against {name} is in. The duel settles when both legs are.
        </p>
      </>
    )
  } else if (duel.result.you === 'quit') {
    body = (
      <>
        <Label>Duel withdrawn</Label>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          {saved.status === 'quarantined'
            ? `Something about this run looked off, so it counts as a quit and the challenge never went to ${name}.`
            : `You quit before the line, so the challenge never went to ${name}.`}
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

/**
 * A run in progress. The top of the screen is the map; the bottom must read
 * at arm's length in sunlight. A duel leads with the gap to the ghost — who
 * you are racing, then how far ahead (green) or behind (garnet) — a solo run
 * with the distance. Time and pace are always there.
 */
function Live({ state }) {
  const duel = state.mode === 'duel' ? state.duel : null
  const started = duel ? state.elapsedMs > 0 : true
  const gpsOk = state.gps === 'ok'

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <RunMap state={state} className="h-[44dvh] shrink-0" />

      <div className="flex flex-1 flex-col px-6 safe-b">
        <div className="flex min-h-[52px] items-center justify-between gap-4 border-b border-rule">
          {duel ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="size-2.5 shrink-0 rounded-full bg-garnet/70" aria-hidden="true" />
              <span className="truncate text-[15px] font-700">
                {duel.leg === 1 ? 'Racing' : 'Replying to'} {duel.opponent?.displayName ?? 'your rival'}
              </span>
              {duel.opponent?.tier?.label && (
                <span className="label shrink-0 text-muted">{duel.opponent.tier.label}</span>
              )}
            </span>
          ) : (
            <span className="label text-ink">Solo run{state.private ? ' · private' : ''}</span>
          )}
          <span className={`label shrink-0 ${gpsOk ? 'text-muted' : 'text-garnet'}`}>{gpsOk ? 'GPS' : 'No GPS'}</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-4">
          {!started ? (
            <p className="max-w-[17rem] text-center text-[17px] text-slate">
              {state.gps === 'ok' || state.gps === 'waiting'
                ? 'Waiting for a good GPS fix. The race starts the moment you have one.'
                : GPS_TEXT[state.gps]}
            </p>
          ) : duel ? (
            <Gap gapM={state.gapM} name={duel.opponent?.displayName} />
          ) : (
            <>
              <p className="display display-tight nums text-[96px]">{(state.metres / 1000).toFixed(2)}</p>
              <p className="label mt-1 text-muted">Kilometres</p>
            </>
          )}
          {started && !gpsOk && <p className="mt-4 text-center text-[13px] text-garnet">{GPS_TEXT[state.gps]}</p>}
        </div>

        <div className="grid grid-cols-3 border-y border-rule">
          {duel ? (
            <>
              <Cell label="To go" value={`${(Math.max(0, duel.distanceM - state.metres) / 1000).toFixed(2)}`} unit="km" />
              <Cell label="Time" value={clock(state.elapsedMs)} align="center" divided />
            </>
          ) : (
            <>
              <Cell label="Time" value={clock(state.elapsedMs)} />
              <Cell label="Avg pace" value={paceClock(averagePace(state))} unit="/km" align="center" divided />
            </>
          )}
          <Cell label="Pace" value={paceClock(state.paceMsPerKm)} unit="/km" align="right" divided />
        </div>

        <div className="flex justify-center py-4">
          <HoldToEnd
            variant="primary"
            className="max-w-[16rem]"
            label={duel ? 'Hold to quit' : 'Hold to finish'}
            onDone={() => run.finish({ quit: Boolean(duel) })}
          />
        </div>
      </div>
    </div>
  )
}

/** The gap: ink numeral, the sign and unit in the colour of the lead. */
function Gap({ gapM, name }) {
  const ahead = (gapM ?? 0) >= 0
  const tone = ahead ? 'text-win' : 'text-garnet'
  return (
    <>
      <p className="display display-tight nums flex items-baseline text-[104px]">
        <span className={tone}>{ahead ? '+' : '−'}</span>
        {Math.round(Math.abs(gapM ?? 0))}
        <span className={`ml-2 text-[48px] ${tone}`}>m</span>
      </p>
      <p className={`label mt-1 ${tone}`}>{ahead ? 'Ahead of' : 'Behind'} {name ?? 'the ghost'}</p>
    </>
  )
}

const ALIGN = { left: 'items-start text-left', center: 'items-center text-center', right: 'items-end text-right' }

function Cell({ label, value, unit, align = 'left', divided = false }) {
  return (
    <div className={`flex flex-col gap-1 py-3 ${ALIGN[align]} ${divided ? 'border-l border-rule' : ''}`}>
      <Label>{label}</Label>
      <p className="display nums text-[26px] leading-none">
        {value}
        {unit && <span className="ml-1 text-[13px] font-700 text-muted">{unit}</span>}
      </p>
    </div>
  )
}
