import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import Crystal, { Shard } from '../components/Crystal.jsx'
import { Button, Label, Rule } from '../components/ui.jsx'

const DUEL_TYPES = [
  { key: 'distance', name: 'Distance duel', detail: '10 minutes' },
  { key: 'pace', name: 'Pace duel', detail: '1 mi' },
  { key: 'sprint', name: 'Sprint duel', detail: '2 km' },
]

export default function Home({ onFindDuel }) {
  const { player, players, pushLocation } = useSession()
  const [type, setType] = useState('distance')

  // Refresh position each time this screen mounts, as well as at join.
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

  return (
    <div className="flex min-h-[calc(100dvh-157px)] flex-col px-6 pt-2">
      <div className="pt-3">
        <Crystal size={66} />
      </div>

      <div className="mt-5 flex flex-col items-center gap-1.5 text-center">
        <Label>Rating</Label>
        <p className="display text-[72px]">{player.rating}</p>
        <p className="label-13 label text-ink">{player.tier?.name}</p>
        <p className="text-[13px] text-slate">
          Top 12% · up 24 this week
        </p>
      </div>

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
              onClick={() => onFindDuel?.(nemesis)}
              className="btn btn-outline w-auto shrink-0 px-6 text-[13px]"
            >
              Challenge
            </button>
          </div>
        ) : (
          <p className="py-5 text-[15px] text-slate">
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
                  type === option.key
                    ? 'bg-indigo'
                    : 'border border-muted'
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
      </div>

      <div className="mt-auto flex flex-col gap-2.5 pt-7">
        <Button onClick={() => onFindDuel?.(null)}>
          <span className="size-2 rounded-full bg-indigo" />
          Find duel
        </Button>
        <p className="text-center text-[13px] text-muted">
          Estimated queue 12 seconds · match within 25 rating
        </p>
      </div>
    </div>
  )
}
