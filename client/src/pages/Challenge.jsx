import { useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { sortPlayers, formatDistance, SORTS } from '../lib/ranking.js'
import { challengePayload, describe } from '../lib/duelTypes.js'
import DuelSetup from '../components/DuelSetup.jsx'
import { Label, EmptyState } from '../components/ui.jsx'

export default function Challenge() {
  const { player, players, send, outgoing, setOutgoing, setNotice } = useSession()
  const [sort, setSort] = useState('match')
  /** The runner a challenge sheet is open for, or null. */
  const [picking, setPicking] = useState(null)

  const others = useMemo(
    () => sortPlayers(players.filter((p) => p.id !== player?.id), sort),
    [players, player?.id, sort]
  )

  if (!player) return null

  const placed = others.filter((p) => p.distanceM != null).length
  const unplaced = others.length - placed

  /** A direct challenge carries the full custom menu — you know who you ask. */
  function confirm(shape) {
    const opponent = picking
    setPicking(null)
    if (!opponent) return
    // send() is false when the socket is down — nothing reached the server,
    // so claiming "sent" would leave them waiting on a challenge nobody got.
    const sent = send('challenge', challengePayload(opponent.id, shape))
    setNotice(sent
      ? { tone: 'good', text: `Challenge sent · ${describe(shape)}` }
      : { tone: 'bad', text: 'Not connected. Try again in a moment.' })
  }

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
          body="Nobody else has joined yet. Open Gapped on another phone and they will show up here the moment they join."
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
                    onClick={() => setPicking(p)}
                    className="btn btn-outline w-auto shrink-0 px-6 text-[13px] disabled:opacity-30"
                  >
                    {p.online ? 'Duel' : 'Away'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {picking && (
        <DuelSetup
          opponent={picking}
          onConfirm={confirm}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}
