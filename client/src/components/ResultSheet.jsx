import { useSession } from '../state/session.jsx'
import Crystal from './Crystal.jsx'
import { Button, Label } from './ui.jsx'
import { clock } from '../lib/format.js'

const HEADLINE = { win: 'Victory', loss: 'Defeat', draw: 'Dead heat' }

/**
 * How a live friend duel ended. Live duels are for pride: they move no
 * points and no hidden rating, so this sheet shows who won and by how much,
 * and nothing else.
 */
export default function ResultSheet() {
  const { result, clearResult, player, send, setNotice } = useSession()
  if (!result) return null

  const timed = result.mode === 'timed'
  const detail = timed
    ? `You ${Math.round(result.progressM ?? 0)} m · them ${Math.round(result.opponentProgressM ?? 0)} m`
    : result.elapsedMs != null
      ? `You ${clock(result.elapsedMs)}${result.opponentElapsedMs != null ? ` · them ${clock(result.opponentElapsedMs)}` : ''}`
      : null

  // Same duel, same terms, straight back at them.
  const canRematch = Boolean(result.opponent?.id && (timed ? result.durationMs : result.distanceM))
  const rematch = () => {
    const sent = send('challenge', timed
      ? { opponentId: result.opponent.id, mode: 'timed', durationMs: result.durationMs }
      : { opponentId: result.opponent.id, mode: 'race', distanceM: result.distanceM })
    clearResult()
    setNotice(sent
      ? { tone: 'good', text: `Challenge sent to ${result.opponent.displayName}.` }
      : { tone: 'bad', text: 'Not connected. Try again in a moment.' })
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px] flex flex-col bg-paper px-6 safe-t safe-b">
      <div className="pt-8">
        <Crystal size={66} tone={player?.tier?.key ?? 'bronze'} />
      </div>

      <div className="mt-7 flex flex-col items-center gap-3 text-center">
        <Label>Live duel versus {result.opponent?.displayName ?? 'opponent'}</Label>
        <p className="display text-[76px]">{HEADLINE[result.outcome] ?? 'Result'}</p>
        {detail && <p className="nums text-[17px] text-slate">{detail}</p>}
        <p className="mt-2 text-[13px] text-muted">Live duels are for pride — no points or rank change hands.</p>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Button onClick={clearResult}>Done</Button>
        {canRematch && (
          <Button variant="quiet" onClick={rematch}>
            Rematch
          </Button>
        )}
      </div>
    </div>
  )
}
