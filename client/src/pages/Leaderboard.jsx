import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { TierBadge, Spinner, EmptyState, Card } from '../components/ui.jsx'

export default function Leaderboard() {
  const { player } = useSession()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/leaderboard?limit=100')
      .then((data) => setRows(data.players))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="🏁"
        title="Nobody has raced yet"
        body="The leaderboard fills up as soon as the first head-to-head is settled. Be first."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      <h2 className="text-2xl font-black tracking-tight">Leaderboard</h2>
      <Card className="p-0">
        <ul className="divide-y divide-ink-800">
          {rows.map((row) => {
            const isMe = row.id === player?.id
            return (
              <li
                key={row.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  isMe ? 'bg-surge-500/10' : ''
                }`}
              >
                <span
                  className={`nums w-8 shrink-0 text-sm font-bold ${
                    row.rank <= 3 ? 'text-volt-400' : 'text-ink-400'
                  }`}
                >
                  {row.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{row.handle}</span>
                    {isMe && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-surge-400">
                        you
                      </span>
                    )}
                  </div>
                  <p className="nums text-xs text-ink-400">
                    {row.wins}W · {row.losses}L
                    {row.draws > 0 ? ` · ${row.draws}D` : ''}
                  </p>
                </div>
                <TierBadge tier={row.tier} />
                <span className="nums w-12 shrink-0 text-right font-bold">
                  {row.rating}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
