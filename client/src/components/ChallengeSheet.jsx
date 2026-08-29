import { useEffect, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { distanceLabel } from '../lib/format.js'
import { Shard } from './Crystal.jsx'
import { Button, Label } from './ui.jsx'

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
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-paper px-6 safe-b">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <Shard size={54} tone="garnet" />
        <Label className="text-garnet">Challenge</Label>
        <p className="display text-[44px]">{incoming.from.displayName}</p>
        <p className="nums text-[15px] text-slate">
          {incoming.from.rating} · wants {distanceLabel(incoming.distanceM)}
        </p>
      </div>
      <div className="flex flex-col gap-2 pb-2">
        <Button onClick={() => respond(true)}>Accept · {secondsLeft}s</Button>
        <Button variant="quiet" onClick={() => respond(false)}>
          Decline
        </Button>
      </div>
    </div>
  )
}
