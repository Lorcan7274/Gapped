import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import { formatsFrom, formatDetail, challengePayload, describe } from '../lib/duelTypes.js'
import Crystal, { Shard } from '../components/Crystal.jsx'
import TierLadder from '../components/TierLadder.jsx'
import DuelSetup from '../components/DuelSetup.jsx'
import { Button, Label, Rule, Spinner } from '../components/ui.jsx'

export default function Home() {
  const {
    player, players, meta, send, setNotice, pushLocation,
    queued, joinQueue, leaveQueue,
  } = useSession()
  const [formatKey, setFormatKey] = useState('race')
  const [ladderOpen, setLadderOpen] = useState(false)
  const [setup, setSetup] = useState(null)

  useEffect(() => {
    let cancelled = false
    getCurrentPosition()
      .then((coords) => !cancelled && pushLocation(coords))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pushLocation])

  // The nemesis is whoever sits closest to you on rating.
  const nemesis = useMemo(() => {
    const others = players.filter((p) => p.id !== player?.id)
    if (others.length === 0) return null
    return [...others].sort(
      (a, b) => (a.ratingGap ?? Infinity) - (b.ratingGap ?? Infinity)
    )[0]
  }, [players, player?.id])

  if (!player) return null

  // While searching, the live search is the selection — the dot must not
  // drift from what the server is actually matching.
  const formats = formatsFrom(meta)
  const activeKey = queued ?? formatKey
  const selected = formats.find((f) => f.key === activeKey) ?? formats[0]

  /** A direct challenge — the only place the full custom menu lives. */
  function confirm(shape) {
    const opponent = setup?.opponent
    setSetup(null)
    if (!opponent) return
    send('challenge', challengePayload(opponent.id, shape))
    setNotice({ tone: 'good', text: `Challenge sent · ${describe(shape)}` })
  }

  function chooseFormat(key) {
    setFormatKey(key)
    // Switching format mid-search moves the search, not just the dot.
    if (queued && queued !== key) joinQueue(key)
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-2">
      {/* Crystal and rating are one thing — one tap opens the full ladder. */}
      <button
        onClick={() => setLadderOpen(true)}
        aria-label="See all ranks"
        className="flex w-full flex-col items-center gap-1.5 pt-3 text-center"
      >
        <Crystal size={66} tone={player.tier?.key ?? 'sapphire'} />
        <Label className="mt-6">Rating</Label>
        <p className="display text-[72px]">{player.rating}</p>
        <p className="label-13 label text-ink">{player.tier?.name}</p>
        <p className="text-[13px] text-slate">Tap for all ranks</p>
      </button>

      {/* Nemesis */}
      <div className="mt-6">
        <Rule />
        {nemesis ? (
          <div className="flex items-center gap-4 py-4">
            <Shard size={22} tone="garnet" />
            <div className="min-w-0 flex-1">
              <Label className="text-garnet">Nemesis</Label>
              <p className="mt-1 truncate text-[17px] font-700 text-ink">
                {nemesis.displayName}
              </p>
              <p className="nums text-[13px] text-muted">
                {nemesis.rating} · {nemesis.ratingGap ?? 0} apart
              </p>
            </div>
            <button
              onClick={() => setSetup({ opponent: nemesis })}
              className="btn btn-outline w-auto shrink-0 px-6 text-[13px]"
            >
              Challenge
            </button>
          </div>
        ) : (
          <p className="py-4 text-[15px] text-slate">
            No nemesis yet. Nobody else has joined.
          </p>
        )}
        <Rule />
      </div>

      {/* Quick match: two fixed formats, nothing to tune. Custom shapes live
          behind a direct challenge, so the random pool never splinters. */}
      <div className="mt-1">
        {formats.map((option, i) => (
          <div key={option.key}>
            {i > 0 && <Rule />}
            <button
              onClick={() => chooseFormat(option.key)}
              className="flex min-h-[56px] w-full items-center gap-4 py-3 text-left"
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${
                  activeKey === option.key ? 'bg-indigo' : 'border border-muted'
                }`}
              />
              <span className="flex-1">
                <span
                  className={`block text-[16px] ${
                    activeKey === option.key ? 'font-700 text-ink' : 'text-muted'
                  }`}
                >
                  {option.name ?? option.key}
                </span>
                <span className="block text-[13px] text-muted">{option.blurb}</span>
              </span>
              <span className="nums text-[13px] text-muted">{formatDetail(option)}</span>
            </button>
          </div>
        ))}
        <Rule />
      </div>

      <div className="mt-auto flex flex-col gap-2.5 pt-7">
        {queued ? (
          <Button variant="outline" onClick={leaveQueue}>
            <Spinner />
            Searching · tap to cancel
          </Button>
        ) : (
          <Button
            onClick={() => {
              // send() returns false on a closed socket; silence here would
              // leave the runner tapping a button that does nothing.
              if (!joinQueue(selected.key)) {
                setNotice({ tone: 'bad', text: 'Not connected. Try again in a moment.' })
              }
            }}
          >
            <span className="size-2 rounded-full bg-indigo" />
            Find duel
          </Button>
        )}
        <p className="text-center text-[13px] text-muted">
          {selected.name ?? selected.key} · {formatDetail(selected)} · match within{' '}
          {meta?.discovery?.ratingSpread ?? 250} rating
        </p>
      </div>

      {ladderOpen && <TierLadder onClose={() => setLadderOpen(false)} />}
      {setup && (
        <DuelSetup
          opponent={setup.opponent}
          onConfirm={confirm}
          onClose={() => setSetup(null)}
        />
      )}
    </div>
  )
}
