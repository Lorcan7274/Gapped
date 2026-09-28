import { useSession } from '../state/session.jsx'
import { Shard } from './Crystal.jsx'
import { Button, Label } from './ui.jsx'

/**
 * The whole ladder, opened by tapping the crystal: every tier, top down, with
 * where you stand. You climb it through your weekly pool — Sunday promotes
 * the top of the table and relegates the bottom. There is no number to chase
 * here; the hidden rating never shows.
 */
export default function TierLadder({ onClose }) {
  const { player, meta } = useSession()
  const tiers = [...(meta?.tiers ?? [])].reverse()
  if (!player || tiers.length === 0) return null

  const current = tiers.findIndex((t) => t.key === player.tier?.key)

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px] overflow-y-auto bg-paper px-6 safe-t safe-b">
      <header className="pb-6 pt-2">
        <Label>Ranks</Label>
        <h2 className="display mt-1 text-[34px]">The ladder</h2>
        <p className="mt-3 max-w-[20rem] text-[15px] leading-relaxed text-slate">
          Finish near the top of your weekly pool to move up. Sunday night settles it.
        </p>
      </header>

      <ul className="flex flex-col">
        {tiers.map((tier, i) => {
          const isCurrent = i === current
          const reached = i >= current
          return (
            <li
              key={tier.key}
              className={`flex items-center gap-4 border-t border-rule py-5 ${reached ? '' : 'opacity-40'}`}
            >
              <Shard size={isCurrent ? 40 : 30} tone={tier.key} still={!isCurrent} />
              <div className="min-w-0 flex-1">
                <span className={`text-[17px] ${isCurrent ? 'font-900' : 'font-700'}`}>{tier.name}</span>
                {isCurrent && <p className="label mt-1 text-muted">You are here · {player.tier.label}</p>}
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
