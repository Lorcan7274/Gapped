import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { clock, distanceLabel, signed } from '../lib/format.js'
import { Shard } from '../components/Crystal.jsx'
import { Button, Label, Rule, Spinner } from '../components/ui.jsx'

export default function Profile() {
  const { player, leave } = useSession()
  const [matches, setMatches] = useState(null)

  useEffect(() => {
    if (!player) return
    api('/api/me/matches', { playerId: player.id })
      .then((d) => setMatches(d.matches))
      .catch(() => setMatches([]))
  }, [player?.id])

  if (!player) return null

  return (
    <div className="px-6 pb-32 pt-6">
      <div className="flex items-center gap-4">
        <Shard size={34} />
        <div className="min-w-0">
          <h2 className="display truncate text-[34px]">{player.displayName}</h2>
          <p className="label mt-1 text-muted">{player.tier?.name}</p>
        </div>
      </div>

      <div className="mt-8 flex items-end justify-between border-y border-rule py-6">
        <div>
          <Label>Rating</Label>
          <p className="display mt-1.5 text-[56px]">{player.rating}</p>
        </div>
        <div className="text-right">
          <Label>Record</Label>
          <p className="display nums mt-1.5 text-[34px]">
            {player.wins}–{player.losses}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Label>Recent duels</Label>
        {matches === null ? (
          <div className="py-8"><Spinner /></div>
        ) : matches.length === 0 ? (
          <p className="mt-3 text-[15px] text-slate">
            No duels yet. Head to the lobby and challenge someone.
          </p>
        ) : (
          <ul className="mt-4">
            {matches.map((m, i) => {
              const won = m.winnerId === player.id
              const delta =
                m.you.ratingAfter != null ? m.you.ratingAfter - m.you.ratingBefore : null
              return (
                <li key={m.id} className={i > 0 ? 'border-t border-rule' : ''}>
                  <div className="flex min-h-[56px] items-center gap-4 py-3.5">
                    <span className="label w-12 shrink-0 text-muted">
                      {m.winnerId == null ? 'Tie' : won ? 'Win' : 'Loss'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">
                        {m.opponent.displayName}
                      </p>
                      <p className="nums text-[13px] text-muted">
                        {distanceLabel(m.distanceM)} · {clock(m.you.elapsedMs)}
                      </p>
                    </div>
                    {delta != null && (
                      <span
                        className={`nums shrink-0 text-[15px] font-700 ${
                          delta >= 0 ? 'text-indigo' : 'text-garnet'
                        }`}
                      >
                        {signed(delta)}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-10">
        <Rule />
        <Button variant="quiet" className="mt-4" onClick={leave}>
          Leave
        </Button>
      </div>
    </div>
  )
}
