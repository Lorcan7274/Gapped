import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { clock, metres, pace, daysAgo } from '../lib/format.js'
import { useRun } from '../lib/run.js'
import { Shard } from '../components/Crystal.jsx'
import RouteMap from '../components/RouteMap.jsx'
import WeeklyChart from '../components/WeeklyChart.jsx'
import { Button, Label, Spinner } from '../components/ui.jsx'

const field =
  'min-h-[56px] w-full border-b border-ink bg-transparent pb-2 text-[17px] ' +
  'font-700 text-ink placeholder:text-muted focus:outline-none'

/**
 * The You tab: what your running has grown — Shards, distance, runs, streak —
 * and the runs themselves. No rating anywhere: the hidden number stays hidden.
 */
export default function Profile({ settingsOpen = false }) {
  const { player, setNotice } = useSession()
  const [runs, setRuns] = useState(null)
  const [openRun, setOpenRun] = useState(null)
  const [weeks, setWeeks] = useState(null)
  // A run just saved should show up without a reload.
  const lastRunId = useRun().result?.run?.id

  useEffect(() => {
    if (!player) return
    api('/api/me/runs')
      .then((d) => setRuns(d.runs))
      .catch(() => setRuns([]))
    api('/api/me/weeks')
      .then((d) => setWeeks(d.weeks))
      .catch(() => setWeeks(null))
  }, [player?.id, lastRunId])

  if (!player) return null
  if (settingsOpen) return <Settings player={player} setNotice={setNotice} />
  if (openRun) return <RunDetail run={openRun} onBack={() => setOpenRun(null)} />

  return (
    <div className="px-6 pb-32 pt-6">
      <div className="flex items-center gap-4">
        <Shard size={34} tone={player.tier?.key ?? 'bronze'} />
        <div className="min-w-0">
          <h2 className="display truncate text-[34px]">{player.displayName}</h2>
          <p className="label mt-1 text-muted">{player.tier?.label}</p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 border-y border-rule">
        <Stat label="Shards" value={player.shards ?? 0} />
        <Stat label="Distance" value={metres(player.lifetimeM ?? 0)} divided />
        <Stat label="Runs" value={player.runs ?? 0} top />
        <Stat label="Streak" value={player.streak ? `${player.streak}d` : '—'} divided top />
      </div>

      {weeks && (
        <div className="mt-7 border-b border-rule pb-6">
          <WeeklyChart weeks={weeks} />
        </div>
      )}

      <div className="mt-7">
        <Label>Recent runs</Label>
        {runs === null ? (
          <div className="py-8"><Spinner /></div>
        ) : runs.length === 0 ? (
          <p className="mt-3 text-[15px] text-slate">
            No runs yet. Start one from the Run tab — every run pays.
          </p>
        ) : (
          <ul className="mt-2.5">
            {runs.map((r, i) => (
              <RunRow key={r.id} run={r} divided={i > 0} onOpen={() => setOpenRun(r)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, divided = false, top = false }) {
  return (
    <div
      className={`flex flex-col gap-1 py-4 ${divided ? 'border-l border-rule pl-4' : ''} ${top ? 'border-t border-rule' : ''}`}
    >
      <Label>{label}</Label>
      <span className="display nums text-[28px]">{value}</span>
    </div>
  )
}

/** One run: when, how far, how long, and what it paid. */
function RunRow({ run, divided, onOpen }) {
  const quarantined = run.status === 'quarantined'
  const tags = [run.kind === 'duel' ? 'Duel leg' : 'Solo', run.private && 'private'].filter(Boolean)
  return (
    <li className={divided ? 'border-t border-rule' : ''}>
      <button onClick={onOpen} className="flex min-h-[56px] w-full items-center gap-3.5 py-[9px] text-left">
        <div className="min-w-0 flex-1">
          <p className="nums text-[15px]">
            {metres(run.distanceM)} <span className="text-muted">· {clock(run.elapsedMs)}</span>
          </p>
          <p className="mt-0.5 text-[13px] text-muted">{tags.join(' · ')}</p>
        </div>
        <div className="shrink-0 text-right">
          {quarantined ? (
            <p className="text-[13px] text-garnet">Under review</p>
          ) : (
            <p className="nums text-[15px] font-700">+{run.shards} shards</p>
          )}
          <p className="mt-0.5 text-[12px] text-muted">{daysAgo(run.startedAt)}</p>
        </div>
      </button>
    </li>
  )
}

const when = (t) =>
  new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * One of your runs on its own page: when, how far, how long, and the route
 * it drew. The route is fetched here and shown to you alone.
 */
function RunDetail({ run, onBack }) {
  const [route, setRoute] = useState(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    api(`/api/me/runs/${run.id}`)
      .then((d) => setRoute(d.route))
      .catch(() => setRoute([]))
  }, [run.id])

  const tags = [run.kind === 'duel' ? 'Duel leg' : 'Solo', run.private && 'private'].filter(Boolean)
  return (
    <div className="pb-32 pt-2">
      <div className="px-6">
        <button onClick={onBack} className="label -ml-1 flex min-h-[56px] items-center px-1 text-ink">
          ← Runs
        </button>
        <h2 className="display text-[34px]">{when(run.startedAt)}</h2>
        <p className="label mt-1 text-muted">{tags.join(' · ')}</p>

        <div className="mt-7 grid grid-cols-3 border-y border-rule">
          <Stat label="Distance" value={metres(run.distanceM)} />
          <Stat label="Time" value={clock(run.elapsedMs)} divided />
          <Stat label="Pace" value={pace(run.elapsedMs, run.distanceM).replace(' /km', '')} divided />
        </div>
        {run.status === 'quarantined' && (
          <p className="mt-3 text-[13px] text-garnet">Under review — this run settled unranked.</p>
        )}
      </div>

      <div className="mt-7">
        {route === null ? (
          <div className="py-8"><Spinner /></div>
        ) : route.length < 2 ? (
          <p className="px-6 text-[15px] text-slate">No route to show for this run.</p>
        ) : (
          <RouteMap route={route} className="h-[52dvh]" />
        )}
      </div>
    </div>
  )
}

/**
 * The gear on the You tab opens this in place of the profile: the name you
 * race under, the number you are verified as, and the way out.
 */
function Settings({ player, setNotice }) {
  const { leave, rename } = useSession()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(player.displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function save(event) {
    event.preventDefault()
    const next = name.trim()
    if (next === player.displayName) return setEditing(false)
    setBusy(true)
    setError(null)
    try {
      await rename(next)
      setEditing(false)
      setNotice({ tone: 'good', text: 'Name updated.' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-6 pb-32 pt-6">
      <h2 className="display text-[34px]">Settings</h2>

      <div className="mt-7 border-t border-rule">
        {editing ? (
          <form onSubmit={save} className="flex flex-col gap-3 border-b border-rule py-4">
            <Label>Display name</Label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoFocus
              autoComplete="nickname"
              aria-label="Display name"
              className={field}
            />
            {error && <p className="text-[13px] text-garnet">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="quiet"
                onClick={() => {
                  setEditing(false)
                  setName(player.displayName)
                  setError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex min-h-[56px] w-full items-center justify-between gap-4 border-b border-rule py-2 text-left"
          >
            <span className="text-[15px]">Display name</span>
            <span className="truncate text-[15px] text-slate">{player.displayName}</span>
          </button>
        )}
      </div>

      <div className="mt-10 border-t border-rule">
        {player.verifiedAs && (
          <p className="nums mt-4 text-[13px] text-muted">Verified as {player.verifiedAs}</p>
        )}
        <Button variant="quiet" className="mt-4" onClick={leave}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
