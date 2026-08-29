import { useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { sortPlayers, formatDistance, SORTS } from '../lib/ranking.js'
import { distanceLabel } from '../lib/format.js'
import { Button, Card, TierBadge, EmptyState } from '../components/ui.jsx'

export default function Challenge() {
  const { player, players, meta, send, outgoing, setOutgoing } = useSession()
  const [sort, setSort] = useState('match')
  const [picking, setPicking] = useState(null)

  const others = useMemo(
    () => sortPlayers(players.filter((p) => p.id !== player?.id), sort),
    [players, player?.id, sort]
  )

  if (!player) return null

  const placed = others.filter((p) => p.distanceM != null).length
  const unplaced = others.length - placed

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      <div>
        <h2 className="text-2xl font-black tracking-tight">Challenge</h2>
        <p className="nums mt-0.5 text-xs text-ink-400">
          {others.length} runner{others.length === 1 ? '' : 's'}
          {unplaced > 0 && ` · ${unplaced} without location`}
        </p>
      </div>

      {/* Sort toggles */}
      <div className="flex gap-1.5 rounded-2xl bg-ink-900 p-1.5">
        {SORTS.map((option) => (
          <button
            key={option.key}
            onClick={() => setSort(option.key)}
            aria-pressed={sort === option.key}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition ${
              sort === option.key
                ? 'bg-surge-500 text-ink-950'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {outgoing && (
        <Card className="border-volt-400/40 bg-volt-400/5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-volt-400">
                Challenge sent to {outgoing.opponent.displayName}
              </p>
              <p className="nums text-xs text-ink-400">
                {distanceLabel(outgoing.distanceM)} · waiting for them to accept
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                send('challenge:cancel', { challengeId: outgoing.challengeId })
                setOutgoing(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {others.length === 0 ? (
        <EmptyState
          icon="🫥"
          title="Nobody to challenge"
          body="Nobody else has joined yet. Open Gap on another phone and they will show up here the moment they join."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {others.map((p) => {
            const noLocation = p.distanceM == null
            return (
              <li key={p.id}>
                <Card className={`flex flex-col gap-3 ${noLocation ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          p.online ? 'bg-surge-500' : 'bg-ink-600'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-bold">{p.displayName}</span>
                          <TierBadge tier={p.tier} />
                        </div>
                        <p className="nums mt-0.5 text-xs text-ink-400">
                          <span className={noLocation ? 'text-ink-600' : 'text-ink-200'}>
                            {formatDistance(p.distanceM)}
                          </span>
                          {' · '}
                          {p.rating}
                          {p.ratingGap != null && (
                            <span className="text-ink-600">
                              {' '}({p.ratingGap === 0 ? 'even' : `${p.ratingGap} apart`})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={Boolean(outgoing) || !p.online}
                      onClick={() => setPicking(picking === p.id ? null : p.id)}
                    >
                      {picking === p.id ? 'Close' : p.online ? 'Duel' : 'Offline'}
                    </Button>
                  </div>

                  {picking === p.id && (
                    <div className="flex flex-wrap gap-2 border-t border-ink-800 pt-3">
                      {(meta?.distances ?? []).map((d) => (
                        <button
                          key={d}
                          onClick={() => {
                            send('challenge', { opponentId: p.id, distanceM: d })
                            setPicking(null)
                          }}
                          className="nums rounded-xl border border-ink-600 px-3 py-2 text-sm
                                     font-semibold text-ink-200 transition
                                     hover:border-surge-500 hover:text-surge-400"
                        >
                          {distanceLabel(d)}
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
