import { useSession } from '../state/session.jsx'
import { Shard } from './Crystal.jsx'
import { Button, Label } from './ui.jsx'

/**
 * The whole ladder, opened by tapping the crystal. Every tier, what it is
 * called, the rating it starts at, and a bar filled to exactly where you
 * stand — inside your current tier, and empty or full for the ones below
 * and above.
 */
export default function TierLadder({ onClose }) {
  const { player, meta } = useSession()
  const tiers = [...(meta?.tiers ?? [])].sort((a, b) => b.floor - a.floor)
  if (!player || tiers.length === 0) return null

  const rating = player.rating
  const currentIndex = tiers.findIndex((t) => rating >= t.floor)

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px] overflow-y-auto bg-paper px-6 safe-t safe-b">
      <header className="flex items-baseline justify-between pb-6 pt-2">
        <div>
          <Label>Ranks</Label>
          <h2 className="display mt-1 text-[34px]">The ladder</h2>
        </div>
        <p className="nums display text-[34px]">{rating}</p>
      </header>

      <ul className="flex flex-col">
        {tiers.map((tier, i) => {
          const isCurrent = i === currentIndex
          const reached = rating >= tier.floor
          // The ceiling of a tier is the floor of the one above it.
          const ceiling = i > 0 ? tiers[i - 1].floor : null
          const span = ceiling ? ceiling - tier.floor : null
          const progress = !reached
            ? 0
            : isCurrent && span
              ? Math.min(100, ((rating - tier.floor) / span) * 100)
              : 100

          return (
            <li
              key={tier.key}
              className={`flex items-center gap-4 border-t border-rule py-5 ${
                reached ? '' : 'opacity-40'
              }`}
            >
              <Shard size={isCurrent ? 40 : 30} tone={tier.key} still={!isCurrent} />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={`text-[17px] ${isCurrent ? 'font-900' : 'font-700'}`}
                  >
                    {tier.name}
                  </span>
                  <span className="nums label text-muted">
                    {ceiling ? `${tier.floor}–${ceiling - 1}` : `${tier.floor}+`}
                  </span>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rule">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${progress}%`,
                      background: isCurrent
                        ? 'linear-gradient(90deg, var(--color-ink), var(--color-indigo))'
                        : 'var(--color-ink)',
                    }}
                  />
                </div>

                {isCurrent && (
                  <p className="nums mt-2 text-[13px] text-slate">
                    {ceiling
                      ? `${ceiling - rating} to ${tiers[i - 1].name}`
                      : 'Top of the ladder'}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-rule pt-6 pb-2">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}
