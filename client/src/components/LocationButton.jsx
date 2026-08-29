import { useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'

/**
 * Header control for turning location on. Location is optional everywhere —
 * you can join and use the app without it — but nobody can find you to duel
 * until it is on, so while it is off this reads as a filled indigo bubble
 * that is hard to miss, and settles into a quiet outline once granted.
 *
 * A browser remembers a refusal and will not prompt again, so a denial says
 * what to do instead of appearing to do nothing.
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

  // Once location is on there is nothing to announce — the pill collapses to
  // a quiet dot that still refreshes the fix on tap.
  if (on) {
    return (
      <button
        onClick={share}
        disabled={busy}
        aria-label="Location is on. Tap to refresh it."
        className="-my-2 -mr-4 flex size-[56px] items-center justify-center transition disabled:opacity-40"
      >
        <span className="size-2 rounded-full bg-indigo" />
      </button>
    )
  }

  return (
    <button
      onClick={share}
      disabled={busy}
      aria-label="Share your location"
      className="label -my-2 flex min-h-[56px] items-center gap-2 rounded-full bg-indigo
                 px-4 text-paper transition disabled:opacity-50"
    >
      <span className="size-2 shrink-0 rounded-full bg-paper" />
      {busy ? 'Locating' : 'Share location'}
    </button>
  )
}
