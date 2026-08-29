import { useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'

/**
 * Header control for turning location on. Location is optional everywhere —
 * you can join and use the app without it — but nobody can find you to duel
 * until it is on, so it needs to be reachable from any screen rather than
 * only at join.
 *
 * A browser remembers a refusal, so once denied it will not prompt again.
 * In that case we say what to do instead of silently doing nothing.
 */
export default function LocationButton() {
  const { player, pushLocation, setNotice } = useSession()
  const [busy, setBusy] = useState(false)

  const on = player?.hasLocation === true

  async function share() {
    setBusy(true)
    try {
      await pushLocation(await getCurrentPosition())
      setNotice({ tone: 'good', text: 'Location on. Runners nearby can find you.' })
    } catch (err) {
      setNotice({
        tone: 'bad',
        text:
          err?.code === 1
            ? 'Location is blocked. Turn it on for this site in your browser settings.'
            : 'Could not get a fix. Try again outdoors.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={share}
      disabled={busy}
      aria-label={on ? 'Location on, tap to refresh' : 'Share your location'}
      className="label -my-2 flex min-h-[56px] items-center gap-1.5 pl-4 text-ink disabled:opacity-40"
    >
      <span
        className={`size-1.5 rounded-full ${on ? 'bg-indigo' : 'border border-muted'}`}
      />
      {busy ? 'Locating' : on ? 'Location' : 'Share location'}
    </button>
  )
}
