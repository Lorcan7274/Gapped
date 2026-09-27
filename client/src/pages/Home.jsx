import { useState } from 'react'
import { useSession } from '../state/session.jsx'
import { run } from '../lib/run.js'
import Crystal from '../components/Crystal.jsx'
import TierLadder from '../components/TierLadder.jsx'
import { Button, Label } from '../components/ui.jsx'

const PRIVATE_KEY = 'gapped.privateRuns'

const readPrivate = () => {
  try {
    return localStorage.getItem(PRIVATE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The Run tab: your crystal and your week, and the one button that matters.
 * The big number is this week's pool points — the visible competitive
 * number. Solo runs always pay and never cost; private is a toggle, not a
 * mode, and a private run pays exactly the same.
 */
export default function Home() {
  const { player } = useSession()
  const [ladderOpen, setLadderOpen] = useState(false)
  const [keepPrivate, setKeepPrivate] = useState(readPrivate)

  if (!player) return null
  const tier = player.tier ?? { key: 'bronze', label: 'Bronze' }

  function togglePrivate() {
    const next = !keepPrivate
    setKeepPrivate(next)
    try {
      localStorage.setItem(PRIVATE_KEY, next ? '1' : '0')
    } catch {
      /* remembered for this visit only */
    }
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-2">
      {/* Crystal and week are one thing — one tap opens the ladder. */}
      <button
        onClick={() => setLadderOpen(true)}
        aria-label="See the ladder"
        className="flex w-full flex-col items-center gap-1.5 pt-3 text-center"
      >
        <Crystal size={62} tone={tier.key} />
        <Label className="mt-3">This week</Label>
        <p className="display num-glow text-[62px]">{player.weekPoints ?? 0}</p>
        <p className="label-13 label text-ink">{tier.label}</p>
        <p className="text-[13px] text-slate">points · tap for the ladder</p>
      </button>

      <div className="mt-6 grid grid-cols-3 border-y border-rule">
        <Stat label="Shards" value={player.shards ?? 0} />
        <Stat label="Fuel" value={player.fuel ?? 0} divided />
        <Stat label="Streak" value={player.streak ? `${player.streak}d` : '—'} divided />
      </div>

      <div className="mt-auto flex flex-col gap-2.5 py-3.5">
        <button
          type="button"
          role="switch"
          aria-checked={keepPrivate}
          onClick={togglePrivate}
          className="flex min-h-[56px] w-full items-center justify-between gap-4 text-left"
        >
          <span>
            <span className="block text-[15px]">Private run</span>
            <span className="block text-[13px] text-muted">
              Pays the same, never shown to your pool
            </span>
          </span>
          <span className={`switch ${keepPrivate ? 'is-on' : ''}`} aria-hidden="true">
            <span className="switch__knob" />
          </span>
        </button>
        <Button onClick={() => run.start({ private: keepPrivate })}>Start run</Button>
        <p className="text-center text-[13px] text-muted">
          Every run pays Shards, Fuel and a few points. Solo never costs you anything.
        </p>
      </div>

      {ladderOpen && <TierLadder onClose={() => setLadderOpen(false)} />}
    </div>
  )
}

function Stat({ label, value, divided = false }) {
  return (
    <div className={`flex flex-col items-center gap-1 py-4 ${divided ? 'border-l border-rule' : ''}`}>
      <Label>{label}</Label>
      <span className="display nums text-[28px]">{value}</span>
    </div>
  )
}
