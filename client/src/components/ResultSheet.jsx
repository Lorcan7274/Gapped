import { useSession } from '../state/session.jsx'
import { preciseClock, signed } from '../lib/format.js'
import { Button, Stat } from './ui.jsx'

const HEADLINES = {
  win: { title: 'You won', icon: '🏆', colour: 'text-surge-400' },
  loss: { title: 'You lost', icon: '💨', colour: 'text-flare-400' },
  draw: { title: 'Dead heat', icon: '🤝', colour: 'text-ink-200' },
}

const REASONS = {
  finished: null,
  forfeit: 'Forfeited.',
  opponent_disconnected: 'Your opponent dropped out.',
}

export default function ResultSheet() {
  const { result, clearResult } = useSession()
  if (!result) return null

  const headline = HEADLINES[result.outcome] ?? HEADLINES.draw
  const delta = result.ratingAfter - result.ratingBefore
  const note = REASONS[result.reason]

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-ink-950 px-6 safe-bottom">
      <span className="text-6xl" aria-hidden="true">
        {headline.icon}
      </span>
      <h2 className={`text-4xl font-black tracking-tight ${headline.colour}`}>
        {headline.title}
      </h2>
      {note && <p className="-mt-3 text-sm text-ink-400">{note}</p>}

      <div className="flex items-baseline gap-3">
        <span className="nums text-6xl font-black">{result.ratingAfter}</span>
        <span
          className={`nums text-2xl font-bold ${
            delta >= 0 ? 'text-surge-400' : 'text-flare-400'
          }`}
        >
          {signed(delta)}
        </span>
      </div>

      <div className="grid w-full max-w-xs grid-cols-2 gap-4 rounded-3xl border border-ink-800 bg-ink-900 p-5">
        <Stat label="Your time" value={preciseClock(result.elapsedMs)} />
        <Stat
          label={result.opponent.handle}
          value={preciseClock(result.opponentElapsedMs)}
        />
      </div>

      <Button size="lg" className="max-w-xs" onClick={clearResult}>
        Done
      </Button>
    </div>
  )
}
