import { useState } from 'react'
import {
  DUEL_TYPES, CUSTOM_DURATIONS, CUSTOM_DISTANCES, formatDuration, formatMetres,
} from '../lib/duelTypes.js'
import { Shard } from './Crystal.jsx'
import { Button, Label, Rule } from './ui.jsx'

/**
 * Pick the shape of a duel. Opened from the nemesis Challenge button and
 * from the Custom row on the home screen, so a duel is never limited to the
 * three presets.
 */
export default function DuelSetup({ opponent, onConfirm, onClose }) {
  const [type, setType] = useState('distance')
  const active = DUEL_TYPES.find((t) => t.key === type) ?? DUEL_TYPES[0]
  const [unit, setUnit] = useState(active.unit)
  const [param, setParam] = useState(active.param)

  const choose = (next) => {
    setType(next.key)
    setUnit(next.unit)
    setParam(next.param)
  }

  const options = unit === 'minutes' ? CUSTOM_DURATIONS : CUSTOM_DISTANCES
  const label = unit === 'minutes' ? formatDuration : formatMetres

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col overflow-y-auto bg-paper px-6 safe-t safe-b">
      <header className="flex items-center gap-4 pb-5 pt-2">
        {opponent && <Shard size={30} tone="garnet" still />}
        <div className="min-w-0">
          <Label>{opponent ? 'Challenge' : 'New duel'}</Label>
          <h2 className="display mt-1 truncate text-[30px]">
            {opponent ? opponent.displayName : 'Choose a format'}
          </h2>
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
          {opponent ? 'Send challenge' : 'Find duel'}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
