import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import { DUEL_TYPES, describe } from '../lib/duelTypes.js'
import Crystal, { Shard } from '../components/Crystal.jsx'
import TierLadder from '../components/TierLadder.jsx'
import DuelSetup from '../components/DuelSetup.jsx'
import { Button, Label, Rule } from '../components/ui.jsx'

export default function Home({ onFindDuel }) {
  const { player, players, meta, pushLocation, send, setNotice } = useSession()
  const [type, setType] = useState('distance')
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

  const selected = DUEL_TYPES.find((t) => t.key === type) ?? DUEL_TYPES[0]

  function confirm(shape) {
    setSetup(null)
    const opponent = setup?.opponent
    if (opponent) {
      // Minutes make a timed duel (most metres before the clock runs out);
      // metres make a race to the line. The server carries both.
      send('challenge', shape.unit === 'minutes'
        ? { opponentId: opponent.id, mode: 'timed', durationMs: shape.param * 60_000 }
        : { opponentId: opponent.id, mode: 'race', distanceM: shape.param })
      setNotice({ tone: 'good', text: `Challenge sent · ${describe(shape)}` })
    } else {
      onFindDuel?.(shape)
    }
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

      {/* Duel type */}
      <div className="mt-1">
        {DUEL_TYPES.map((option, i) => (
          <div key={option.key}>
            {i > 0 && <Rule />}
            <button
              onClick={() => setType(option.key)}
              className="flex min-h-[56px] w-full items-center gap-4 py-3 text-left"
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${
                  type === option.key ? 'bg-indigo' : 'border border-muted'
                }`}
              />
              <span
                className={`flex-1 text-[16px] ${
                  type === option.key ? 'font-700 text-ink' : 'text-muted'
                }`}
              >
                {option.name}
              </span>
              <span className="nums text-[13px] text-muted">{option.detail}</span>
            </button>
          </div>
        ))}
        <Rule />
        <button
          onClick={() => setSetup({ opponent: null })}
          className="flex min-h-[56px] w-full items-center gap-4 py-3 text-left"
        >
          <span className="size-2.5 shrink-0 rounded-full border border-muted" />
          <span className="flex-1 text-[16px] text-muted">Custom</span>
          <span className="label text-muted">Set it</span>
        </button>
        <Rule />
      </div>

      <div className="mt-auto flex flex-col gap-2.5 pt-7">
        <Button
          onClick={() =>
            onFindDuel?.({ type: selected.key, unit: selected.unit, param: selected.param })
          }
        >
          <span className="size-2 rounded-full bg-indigo" />
          Find duel
        </Button>
        <p className="text-center text-[13px] text-muted">
          {selected.name} · {selected.detail} · match within{' '}
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
