import { useState } from 'react'
import {
  DUEL_TYPES, distancesFrom, durationsFrom, formatDuration, formatMetres,
} from '../lib/duelTypes.js'
import { useSession } from '../state/session.jsx'
import { Shard } from './Crystal.jsx'
import { Button, Label, Rule } from './ui.jsx'

/**
 * Pick the shape of a direct challenge. Opened from the nemesis Challenge
 * button and the lobby's Duel button — always aimed at a named opponent,
 * and only here is the full menu of distances and durations on offer.
 * Quick match runs two fixed formats instead (see Home).
 */
export default function DuelSetup({ opponent, onConfirm, onClose }) {
  const { meta } = useSession()
  const [type, setType] = useState('distance')
  const active = DUEL_TYPES.find((t) => t.key === type) ?? DUEL_TYPES[0]
  const [unit, setUnit] = useState(active.unit)
  const [param, setParam] = useState(active.param)

  const choose = (next) => {
    setType(next.key)
    setUnit(next.unit)
    setParam(next.param)
  }

  const options = unit === 'minutes' ? durationsFrom(meta) : distancesFrom(meta)
  const label = unit === 'minutes' ? formatDuration : formatMetres

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col overflow-y-auto bg-paper px-6 safe-t safe-b">
      <header className="flex items-center gap-4 pb-5 pt-2">
        <Shard size={30} tone="garnet" still />
        <div className="min-w-0">
          <Label>Challenge</Label>
          <h2 className="display mt-1 truncate text-[30px]">{opponent.displayName}</h2>
        </div>
      </header>

      <Rule />
      {DUEL_TYPES.map((option) => (
        <div key={option.key}>
          <button
            onClick={() => choose(option)}
            className="flex min-h-[56px] w-full items-center gap-4 py-4 text-left"
          >
            <span
              className={`size-2.5 shrink-0 rounded-full ${
                type === option.key ? 'bg-indigo' : 'border border-muted'
              }`}
            />
            <span className="flex-1">
              <span
                className={`block text-[16px] ${
                  type === option.key ? 'font-700 text-ink' : 'text-muted'
                }`}
              >
                {option.name}
              </span>
              <span className="block text-[13px] text-muted">{option.blurb}</span>
            </span>
          </button>
          <Rule />
        </div>
      ))}

      {/* Amount — always visible, so any duel can be tuned. */}
      <div className="pt-6">
        <div className="flex items-baseline justify-between">
          <Label>{unit === 'minutes' ? 'How long' : 'How far'}</Label>
          <span className="nums display text-[24px]">{label(param)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((value) => (
            <button
              key={value}
              onClick={() => setParam(value)}
              className={`nums label flex min-h-[56px] items-center rounded-full border px-5 transition ${
                param === value
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule text-slate'
              }`}
            >
              {label(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Button onClick={() => onConfirm({ type, unit, param })}>
          Send challenge
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
