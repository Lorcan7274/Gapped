import { useEffect, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { metres, distanceLabel } from '../lib/format.js'
import { Button, TierBadge } from './ui.jsx'

// The modal that fires when somebody nearby calls you out.
export default function ChallengeSheet() {
  const { incoming, send, setIncoming } = useSession()
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!incoming) return
    const tick = () => {
      const left = Math.ceil((incoming.expiresAt - Date.now()) / 1000)
      setSecondsLeft(Math.max(0, left))
      if (left <= 0) setIncoming(null)
    }
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [incoming, setIncoming])

  if (!incoming) return null

  const respond = (accept) => {
    send('challenge:respond', { challengeId: incoming.challengeId, accept })
    setIncoming(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink-950/80 backdrop-blur-sm">
      <div className="w-full rounded-t-3xl border-t border-ink-700 bg-ink-900 p-6 safe-bottom">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink-700" />

        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-flare-400">
          Challenge
        </p>

        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="relative">
            <span className="absolute inset-0 animate-ping-slow rounded-full bg-flare-500/30" />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-ink-800 text-2xl font-black">
              {incoming.from.displayName.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{incoming.from.displayName}</span>
            <TierBadge tier={incoming.from.tier} />
          </div>
          <p className="nums text-sm text-ink-400">
            {incoming.from.rating} · {metres(incoming.from.distanceM)} away
          </p>
        </div>

        <p className="mt-5 text-center text-lg">
          wants to race you over{' '}
          <span className="nums font-black text-surge-400">
            {distanceLabel(incoming.distanceM)}
          </span>
        </p>

        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => respond(false)}>
            Decline
          </Button>
          <Button className="flex-1" onClick={() => respond(true)}>
            Accept · {secondsLeft}s
          </Button>
        </div>
      </div>
    </div>
  )
}
