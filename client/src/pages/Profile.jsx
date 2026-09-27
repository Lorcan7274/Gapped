import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { clock, metres, daysAgo } from '../lib/format.js'
import { useRun } from '../lib/run.js'
import { Shard } from '../components/Crystal.jsx'
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
  // A run just saved should show up without a reload.
  const lastRunId = useRun().result?.run?.id

  useEffect(() => {
    if (!player) return
    api('/api/me/runs')
      .then((d) => setRuns(d.runs))
      .catch(() => setRuns([]))
  }, [player?.id, lastRunId])

  if (!player) return null
  if (settingsOpen) return <Settings player={player} setNotice={setNotice} />

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
              <RunRow key={r.id} run={r} divided={i > 0} />
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
function RunRow({ run, divided }) {
  const quarantined = run.status === 'quarantined'
  const tags = [run.kind === 'solo' ? 'Solo' : run.kind, run.private && 'private'].filter(Boolean)
  return (
    <li className={divided ? 'border-t border-rule' : ''}>
      <div className="flex min-h-[56px] items-center gap-3.5 py-[9px]">
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
      </div>
    </li>
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
