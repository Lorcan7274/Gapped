import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { Shard } from '../components/Crystal.jsx'
import { Label, Spinner } from '../components/ui.jsx'

/**
 * Bands come from the server's own tier table via /api/meta, so the ladder
 * headings can never drift out of step with the tier shown next to a rating.
 */
const bandsFrom = (tiers) =>
  [...(tiers ?? [])].sort((a, b) => b.floor - a.floor)

const bandFor = (bands, rating) =>
  bands.find((b) => rating >= b.floor) ?? bands.at(-1) ?? null

export default function Leaderboard() {
  const { player, players, meta } = useSession()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    api('/api/leaderboard?limit=100')
      .then((d) => setRows(d.players))
      .catch(() => setRows([]))
  }, [])

  // Fall back to the live roster so the sheet is never empty pre-duels.
  const ladder = useMemo(() => {
    const source = rows && rows.length > 0 ? rows : players
    return [...source]
      .sort((a, b) => b.rating - a.rating)
      .map((p, i) => ({ ...p, rank: i + 1 }))
  }, [rows, players])

  // The leaderboard endpoint has no viewer, so it cannot supply a rating gap.
  // Compute it here against your own rating instead of trusting a field that
  // is undefined for every row.
  const nemesisId = useMemo(() => {
    if (!player) return null
    const others = ladder.filter((p) => p.id !== player.id)
    if (others.length === 0) return null
    return [...others].sort(
      (a, b) =>
        Math.abs(a.rating - player.rating) - Math.abs(b.rating - player.rating)
    )[0].id
  }, [ladder, player])

  const bands = bandsFrom(meta?.tiers)

  if (rows === null || bands.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  // Group into bands, dropping empty ones.
  const grouped = bands
    .map((band) => ({
      band,
      entries: ladder.filter((p) => bandFor(bands, p.rating)?.name === band.name),
    }))
    .filter((g) => g.entries.length > 0)

  return (
    <div className="px-6 pb-32 pt-6">
      <h2 className="display text-[34px]">Ladder</h2>
      <p className="mt-1 text-[13px] text-slate">Ranked by rating</p>

      <div className="mt-8 flex flex-col gap-9">
        {grouped.map(({ band, entries }) => (
          <section key={band.name}>
            <div className="flex items-center gap-2.5 border-b border-ink pb-2.5">
              <Shard size={14} tone={band.key} still />
              <span className="label text-ink">{band.name}</span>
            </div>

            {entries.map((row, i) => {
              const isYou = row.id === player?.id
              const isNemesis = row.id === nemesisId
              if (isYou) {
                return (
                  <div
                    key={row.id}
                    className="my-1.5 flex min-h-[58px] items-center gap-4 rounded-xl bg-ink px-4 py-3.5 text-paper"
                  >
                    <span className="nums w-7 shrink-0 text-[15px] font-700">
                      {row.rank}
                    </span>
                    {row.rank === 1 && (
                      <span className="label shrink-0 text-indigo-soft">
                        Apex
                      </span>
                    )}
                    <span className="flex-1 truncate text-[16px] font-700">
                      {row.displayName}
                    </span>
                    <span className="label shrink-0 text-indigo-soft">
                      You
                    </span>
                    <span className="nums w-12 shrink-0 text-right text-[16px] font-900">
                      {row.rating}
                    </span>
                  </div>
                )
              }
              return (
                <div
                  key={row.id}
                  className={`flex min-h-[56px] items-center gap-4 py-3.5 ${
                    i > 0 ? 'border-t border-rule' : ''
                  }`}
                >
                  <span className="nums w-7 shrink-0 text-[15px] text-muted">
                    {row.rank}
                  </span>
                  {isNemesis && <Shard size={13} tone="garnet" still />}
                  {row.rank === 1 && (
                    <span className="label text-indigo">Apex</span>
                  )}
                  <span className="flex-1 truncate text-[16px]">{row.displayName}</span>
                  <span className="nums w-12 shrink-0 text-right text-[16px] font-700">
                    {row.rating}
                  </span>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
