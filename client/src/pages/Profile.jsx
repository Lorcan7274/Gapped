import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { clock, distanceLabel, signed } from '../lib/format.js'
import { Button, Card, TierBadge, Stat, Spinner } from '../components/ui.jsx'

export default function Profile() {
  const { token, player, meta, signOut } = useSession()
  const [matches, setMatches] = useState(null)

  useEffect(() => {
    api('/api/me/matches', { token })
      .then((data) => setMatches(data.matches))
      .catch(() => setMatches([]))
  }, [token])

  if (!player) return null

  const nextTier = (meta?.tiers ?? []).find((t) => t.floor > player.rating)
  const winRate =
    player.games > 0 ? Math.round((player.wins / player.games) * 100) : null

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{player.handle}</h2>
          <div className="mt-1.5 flex items-center gap-2">
            <TierBadge tier={player.tier} size="lg" />
            {player.rank && (
              <span className="nums text-sm text-ink-400">rank #{player.rank}</span>
            )}
          </div>
        </div>
        <span className="nums text-5xl font-black leading-none">{player.rating}</span>
      </div>

      {nextTier && (
        <Card>
          <p className="text-sm text-ink-400">
            <span className="nums font-bold text-ink-50">
              {nextTier.floor - player.rating}
            </span>{' '}
            rating to{' '}
            <span className="font-bold" style={{ color: nextTier.colour }}>
              {nextTier.name}
            </span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.min(100, Math.max(4, (player.rating / nextTier.floor) * 100))}%`,
                backgroundColor: nextTier.colour,
              }}
            />
          </div>
        </Card>
      )}

      <Card className="grid grid-cols-4 gap-2">
        <Stat label="Races" value={player.games} />
        <Stat label="Won" value={player.wins} tone="good" />
        <Stat label="Lost" value={player.losses} tone="bad" />
        <Stat label="Win %" value={winRate == null ? '—' : `${winRate}%`} />
      </Card>

      <Card className="grid grid-cols-2 gap-2">
        <Stat label="Peak rating" value={player.peakRating} />
        <Stat label="Draws" value={player.draws} />
      </Card>

      <h3 className="mt-2 text-sm font-bold uppercase tracking-wider text-ink-400">
        Recent races
      </h3>
      {matches == null ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : matches.length === 0 ? (
        <p className="py-4 text-sm text-ink-400">
          No finished races yet. Head to Nearby and challenge someone.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((m) => {
            const won = m.winnerId === player.id
            const drew = m.winnerId == null
            const delta =
              m.you.ratingAfter != null ? m.you.ratingAfter - m.you.ratingBefore : null
            return (
              <li key={m.id}>
                <Card className="flex items-center gap-3 py-3">
                  <span
                    className={`w-9 shrink-0 text-center text-xs font-black uppercase ${
                      drew ? 'text-ink-400' : won ? 'text-surge-400' : 'text-flare-400'
                    }`}
                  >
                    {drew ? 'Tie' : won ? 'Win' : 'Loss'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      vs {m.opponent.handle}
                    </p>
                    <p className="nums text-xs text-ink-400">
                      {distanceLabel(m.distanceM)} · {clock(m.you.elapsedMs)}
                    </p>
                  </div>
                  {delta != null && (
                    <span
                      className={`nums text-sm font-bold ${
                        delta >= 0 ? 'text-surge-400' : 'text-flare-400'
                      }`}
                    >
                      {signed(delta)}
                    </span>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Button variant="outline" onClick={signOut} className="mt-4">
        Sign out
      </Button>
    </div>
  )
}
