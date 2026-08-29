import { useEffect, useState } from 'react'
import { useSession } from '../state/session.jsx'
import Crystal from './Crystal.jsx'
import { Button, Label } from './ui.jsx'

const HEADLINE = { win: 'Victory', loss: 'Defeat', draw: 'Dead heat' }

export default function ResultSheet() {
  const { result, clearResult } = useSession()
  const [swept, setSwept] = useState(false)

  // The rank bar sweeps in from zero once, on mount.
  useEffect(() => {
    if (!result) return setSwept(false)
    const t = setTimeout(() => setSwept(true), 120)
    return () => clearTimeout(t)
  }, [result])

  if (!result) return null

  const delta = result.ratingAfter - result.ratingBefore
  const progress = Math.min(100, Math.max(6, ((result.ratingAfter % 150) / 150) * 100))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper px-6 safe-t safe-b">
      <div className="pt-8">
        <Crystal size={66} />
      </div>

      <div className="mt-7 flex flex-col items-center gap-3 text-center">
        <Label>Distance duel versus {result.opponent?.displayName ?? 'opponent'}</Label>
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
          <Label>{result.tierName ?? 'Sapphire II'}</Label>
          <Label>{result.nextTierName ?? 'Sapphire III'}</Label>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
          <div
            className="h-full rounded-full transition-[width] duration-[900ms] ease-out"
            style={{
              width: swept ? `${progress}%` : '0%',
              background: 'linear-gradient(90deg, #101010, #4F46E5)',
            }}
          />
        </div>
        <p className="nums mt-4 text-[13px] text-slate">
          {Math.round((result.elapsedMs ?? 0) / 1000)}s · your distance beat theirs
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
