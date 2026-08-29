import { useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { sortPlayers, formatDistance, SORTS } from '../lib/ranking.js'
import { distanceLabel } from '../lib/format.js'
import { durationsFrom } from '../lib/duelTypes.js'
import { Label, EmptyState } from '../components/ui.jsx'

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
    <div className="px-6 pb-32 pt-6">
      <h2 className="display text-[34px]">Lobby</h2>
      <p className="nums mt-1 text-[13px] text-slate">
        {others.length} runner{others.length === 1 ? '' : 's'}
        {unplaced > 0 && ` · ${unplaced} without location`}
      </p>

      {/* Sort toggles */}
      <div className="mt-5 flex gap-6 border-b border-rule">
        {SORTS.map((option) => (
          <button
            key={option.key}
            onClick={() => setSort(option.key)}
            aria-pressed={sort === option.key}
            className={`label flex min-h-[56px] items-center transition ${
              sort === option.key
                ? 'border-b-2 border-ink text-ink'
                : 'border-b-2 border-transparent text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {outgoing && (
        <div className="mt-5 border-y border-rule py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-indigo">Challenge sent</Label>
              <p className="mt-1 truncate text-[15px]">
                {outgoing.opponent.displayName}
              </p>
            </div>
            <button
              onClick={() => {
                send('challenge:cancel', { challengeId: outgoing.challengeId })
                setOutgoing(null)
              }}
              className="btn btn-outline w-auto shrink-0 px-5 text-[13px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {others.length === 0 ? (
        <EmptyState
          title="Nobody to challenge"
          body="Nobody else has joined yet. Open Gap on another phone and they will show up here the moment they join."
        />
      ) : (
        <ul className="mt-2">
          {others.map((p, i) => {
            const noLocation = p.distanceM == null
            return (
              <li key={p.id} className={i > 0 ? 'border-t border-rule' : ''}>
                <div className="flex min-h-[64px] items-center gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate text-[17px] font-700 ${
                          noLocation ? 'text-muted' : 'text-ink'
                        }`}
                      >
                        {p.displayName}
                      </span>
                      <span className="label text-muted">{p.tier?.name}</span>
                    </div>
                    <p className="nums mt-1 text-[13px] text-slate">
                      {formatDistance(p.distanceM)} · {p.rating}
                      {p.ratingGap != null &&
                        ` · ${p.ratingGap === 0 ? 'even' : `${p.ratingGap} apart`}`}
                    </p>
                  </div>
                  <button
                    disabled={Boolean(outgoing) || !p.online}
                    onClick={() => setPicking(picking === p.id ? null : p.id)}
                    className="btn btn-outline w-auto shrink-0 px-6 text-[13px] disabled:opacity-30"
                  >
                    {picking === p.id ? 'Close' : p.online ? 'Duel' : 'Away'}
                  </button>
                </div>

                {picking === p.id && (
                  <div className="pb-4">
                    <Label>Race to</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(meta?.distances ?? []).map((d) => (
                        <button
                          key={d}
                          onClick={() => {
                            send('challenge', { opponentId: p.id, mode: 'race', distanceM: d })
                            setPicking(null)
                          }}
                          className="nums label min-h-[56px] rounded-full border border-ink px-5 text-ink"
                        >
                          {distanceLabel(d)}
                        </button>
                      ))}
                    </div>
                    <Label className="mt-4">Most metres in</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {durationsFrom(meta).map((minutes) => (
                        <button
                          key={minutes}
                          onClick={() => {
                            send('challenge', {
                              opponentId: p.id, mode: 'timed', durationMs: minutes * 60_000,
                            })
                            setPicking(null)
                          }}
                          className="nums label min-h-[56px] rounded-full border border-rule px-5 text-slate"
                        >
                          {minutes} min
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
