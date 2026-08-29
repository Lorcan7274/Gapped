import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import Crystal from './Crystal.jsx'
import { Button, Label } from './ui.jsx'

const HEADLINE = { win: 'Victory', loss: 'Defeat', draw: 'Dead heat' }

export default function ResultSheet() {
  const { result, clearResult, meta } = useSession()
  const [swept, setSwept] = useState(false)

  // The rank bar sweeps in from zero once, on mount.
  useEffect(() => {
    if (!result) return setSwept(false)
    const t = setTimeout(() => setSwept(true), 120)
    return () => clearTimeout(t)
  }, [result])

  if (!result) return null

  const delta = result.ratingAfter - result.ratingBefore
  const lost = delta < 0

  // Where a rating sits inside its own tier band. The old version used
  // rating % 150, which meant nothing, and always animated up from zero —
  // so a loss still looked like progress.
  const bar = useMemo(() => {
    const tiers = [...(meta?.tiers ?? [])].sort((a, b) => b.floor - a.floor)
    const place = (rating) => {
      if (tiers.length === 0) return 0
      const i = tiers.findIndex((t) => rating >= t.floor)
      const tier = tiers[i] ?? tiers[tiers.length - 1]
      const ceiling = i > 0 ? tiers[i - 1].floor : tier.floor + 200
      const span = Math.max(1, ceiling - tier.floor)
      return Math.min(100, Math.max(0, ((rating - tier.floor) / span) * 100))
    }
    return {
      from: place(result.ratingBefore),
      to: place(result.ratingAfter),
      tier: tiers.find((t) => result.ratingAfter >= t.floor)?.name ?? '',
      next:
        tiers[tiers.findIndex((t) => result.ratingAfter >= t.floor) - 1]?.name ?? null,
    }
  }, [meta, result.ratingBefore, result.ratingAfter])

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px] flex flex-col bg-paper px-6 safe-t safe-b">
      <div className="pt-8">
        <Crystal size={66} />
      </div>

      <div className="mt-7 flex flex-col items-center gap-3 text-center">
        {/* The result frame does not carry the mode, so do not claim one. */}
        <Label>Duel versus {result.opponent?.displayName ?? 'opponent'}</Label>
        <p className="display text-[76px]">{HEADLINE[result.outcome] ?? 'Result'}</p>

        <div className="mt-1 flex items-baseline gap-4">
          <span className="display text-[56px] text-indigo">
            {delta >= 0 ? '+' : ''}{delta}
          </span>
          <span className="nums text-[17px] text-muted">
            {result.ratingBefore} → {result.ratingAfter}
          </span>
        </div>
      </div>

      {/* Rank progress */}
      <div className="mt-10">
        <div className="flex items-center justify-between pb-2.5">
          <Label>{bar.tier}</Label>
          {bar.next && <Label>{bar.next}</Label>}
        </div>
        {/* The bar animates from where you were to where you are, so a loss
            visibly moves backwards instead of filling up. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
          <div
            className="h-full rounded-full transition-[width] duration-[900ms] ease-out"
            style={{
              width: `${swept ? bar.to : bar.from}%`,
              background: lost
                ? 'var(--color-garnet)'
                : 'linear-gradient(90deg, #101010, #4F46E5)',
            }}
          />
        </div>
        <p className="nums mt-4 text-[13px] text-slate">
          {Math.round((result.elapsedMs ?? 0) / 1000)}s ·{' '}
          {lost ? 'rating down' : delta === 0 ? 'rating held' : 'rating up'}
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Button onClick={clearResult}>Done</Button>
        <Button variant="quiet" onClick={clearResult}>
          Rematch
        </Button>
      </div>
    </div>
  )
}
