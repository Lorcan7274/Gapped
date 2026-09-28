import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { run } from '../lib/run.js'
import { useSession } from '../state/session.jsx'
import { clock, metres, daysAgo, signedClock } from '../lib/format.js'
import { Button, Label, Spinner } from '../components/ui.jsx'

/**
 * Duels, one screen: challenges waiting on your reply, legs you started that
 * never came in, runs you can race as ghosts, challenges waiting on theirs,
 * and results. Tapping a ghost asks once — a duel costs Fuel — then the race
 * starts.
 */
export default function Duels({ onClose }) {
  const { player, meta, updatePlayer, setNotice } = useSession()
  const [duels, setDuels] = useState(null)
  const [feed, setFeed] = useState(null)
  const [picked, setPicked] = useState(null) // a feed run, or a duel to reply to
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const cost = meta?.duel?.fuelCost ?? feed?.fuelCost ?? 0

  const load = useCallback(() => {
    api('/api/duels').then((d) => setDuels(d.duels)).catch(() => setDuels([]))
    api('/api/feed').then(setFeed).catch(() => setFeed({ runs: [] }))
  }, [])
  useEffect(load, [load])

  async function go() {
    setBusy(true)
    setError(null)
    try {
      if (picked.kind === 'reply') {
        const { duel, ghost } = await api(`/api/duels/${picked.duel.id}/reply`, { method: 'POST' })
        run.startLeg({ duel, profile: ghost.profile, timeMs: ghost.timeMs, distanceM: ghost.distanceM, leg: 2 })
      } else {
        const { duel, ghost, player: next } = await api('/api/duels', {
          method: 'POST', body: { runId: picked.run.id },
        })
        updatePlayer(next)
        run.startLeg({ duel, profile: ghost.profile, timeMs: ghost.timeMs, distanceM: ghost.distanceM, leg: 1 })
      }
    } catch (err) {
      setError(err.message)
      setBusy(false)
      load()
    }
  }

  if (!player) return null
  const open = duels ?? []
  const replies = open.filter((d) => d.yourTurn)
  // Your own leg, started but not in: a run lost mid-race, or still queued on this phone.
  const unfinished = open.filter(
    (d) => (d.role === 'challenger' && d.status === 'leg1') || (d.role === 'target' && d.status === 'leg2')
  )
  const waiting = open.filter((d) => d.role === 'challenger' && (d.status === 'awaiting' || d.status === 'leg2'))
  const results = open.filter((d) => d.result)

  if (picked) {
    const isReply = picked.kind === 'reply'
    const who = isReply ? picked.duel.opponent : picked.run.player
    const distanceM = isReply ? picked.duel.distanceM : picked.run.distanceM
    const timeMs = isReply ? picked.duel.legs.challenger.ms : picked.run.timeMs
    const short = !isReply && player.fuel < cost
    return (
      <Overlay>
        <div className="flex flex-1 flex-col justify-center">
          <Label>{isReply ? 'Reply' : 'Duel'} · {who?.displayName}</Label>
          <p className="display nums mt-2 text-[56px]">{metres(distanceM)}</p>
          <p className="nums mt-1 text-[17px] text-slate">Their time {clock(timeMs)}</p>
          <ul className="mt-8 border-t border-rule text-[15px] leading-relaxed text-slate">
            <li className="border-b border-rule py-3">
              {isReply
                ? `You race ${who?.displayName}’s run. Both legs together decide it.`
                : `You race ${who?.displayName}’s ghost. They race your run back by Sunday night.`}
            </li>
            <li className="border-b border-rule py-3">The clock starts on your first GPS fix and stops at the line.</li>
            <li className="border-b border-rule py-3">Quitting counts as losing by the expected margin.</li>
          </ul>
          {error && <p className="mt-4 text-[13px] text-garnet">{error}</p>}
        </div>
        <div className="flex flex-col gap-2 pb-2">
          <Button onClick={go} disabled={busy || short}>
            {busy ? 'Starting…' : isReply ? 'Start the reply' : short ? `Needs ${cost} Fuel — you have ${player.fuel}` : `Race · ${cost} Fuel`}
          </Button>
          <Button variant="quiet" onClick={() => { setPicked(null); setError(null) }}>Back</Button>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay>
      <header className="pb-4 pt-2">
        <Label>Fuel {player.fuel} · a duel costs {cost}</Label>
        <h2 className="display mt-1 text-[34px]">Duels</h2>
      </header>

      {duels === null || feed === null ? (
        <div className="py-10"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-4">
          {replies.length > 0 && (
            <Section title="Your reply">
              {replies.map((d) => (
                <Row
                  key={d.id}
                  title={`${d.opponent?.displayName} challenged you`}
                  detail={`${metres(d.distanceM)} · their time ${clock(d.legs.challenger.ms)} · reply by Sunday`}
                  action="Reply"
                  onClick={() => setPicked({ kind: 'reply', duel: d })}
                />
              ))}
            </Section>
          )}

          {unfinished.length > 0 && (
            <Section title="Not finished">
              {unfinished.map((d) => (
                <Row
                  key={d.id}
                  title={d.opponent?.displayName}
                  detail={`${metres(d.distanceM)} · your leg is not in — a quit on Sunday unless it arrives`}
                />
              ))}
            </Section>
          )}

          <Section title="Race a ghost">
            {feed.runs.length === 0 ? (
              <p className="py-3 text-[15px] text-slate">No runs to race yet. When other runners log a run, it shows up here.</p>
            ) : (
              feed.runs.map((r) => (
                <Row
                  key={r.id}
                  title={r.player.displayName}
                  sub={r.player.tier?.label}
                  detail={`${metres(r.distanceM)} · ${clock(r.timeMs)} · ${daysAgo(r.startedAt)}`}
                  action="Race"
                  onClick={() => setPicked({ kind: 'race', run: r })}
                />
              ))
            )}
          </Section>

          {waiting.length > 0 && (
            <Section title="Waiting on them">
              {waiting.map((d) => (
                <Row
                  key={d.id}
                  title={d.opponent?.displayName}
                  detail={`${metres(d.distanceM)} · you ${signedClock(d.ghostMs - d.legs.challenger.ms)} on their ghost${d.status === 'leg2' ? ' · replying now' : ''}`}
                />
              ))}
            </Section>
          )}

          {results.length > 0 && (
            <Section title="Results">
              {results.map((d) => <ResultRow key={d.id} duel={d} />)}
            </Section>
          )}
        </div>
      )}

      <div className="border-t border-rule pt-4 pb-2">
        <Button variant="quiet" onClick={onClose}>Close</Button>
      </div>
    </Overlay>
  )
}

function Overlay({ children }) {
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col bg-paper px-6 safe-t safe-b">
      {children}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-5">
      <Label>{title}</Label>
      <ul className="mt-1.5">{children}</ul>
    </section>
  )
}

function Row({ title, sub, detail, action, onClick }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">
          {title} {sub && <span className="label ml-1 text-muted">{sub}</span>}
        </p>
        <p className="nums mt-0.5 text-[13px] text-muted">{detail}</p>
      </div>
      {action && <span className="label shrink-0 text-ink">{action}</span>}
    </>
  )
  return (
    <li className="border-t border-rule first:border-t-0">
      {onClick ? (
        <button onClick={onClick} className="flex min-h-[56px] w-full items-center gap-3.5 py-[9px] text-left">
          {inner}
        </button>
      ) : (
        <div className="flex min-h-[56px] items-center gap-3.5 py-[9px]">{inner}</div>
      )}
    </li>
  )
}

const OUTCOME = {
  won: { word: 'Win', tone: 'text-win' },
  lost: { word: 'Loss', tone: 'text-garnet' },
  tie: { word: 'Tie', tone: 'text-muted' },
  quit: { word: 'Quit', tone: 'text-muted' },
  none: { word: 'Off', tone: 'text-muted' },
}

function ResultRow({ duel }) {
  const r = duel.result
  const o = OUTCOME[r.you] ?? OUTCOME.none
  const detail =
    r.outcome === 'walkover' ? 'No reply by Sunday'
    : r.outcome === 'withdrawn' ? 'Withdrawn'
    : r.outcome === 'void' ? 'Did not count'
    : `${signedClock(r.marginMs)} over both legs`
  return (
    <li className="border-t border-rule first:border-t-0">
      <div className="flex min-h-[56px] items-center gap-3.5 py-[9px]">
        <span className={`label w-11 shrink-0 tracking-[0.18em] ${o.tone}`}>{o.word}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{duel.opponent?.displayName}</p>
          <p className="nums mt-0.5 text-[13px] text-muted">{metres(duel.distanceM)} · {detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="nums text-[15px] font-700">{r.points > 0 ? `+${r.points}` : r.points < 0 ? `−${Math.abs(r.points)}` : '±0'}</p>
          <p className="mt-0.5 text-[12px] text-muted">{daysAgo(duel.settledAt)}</p>
        </div>
      </div>
    </li>
  )
}
