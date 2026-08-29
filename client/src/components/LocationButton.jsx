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

  return (
    <button
      onClick={share}
      disabled={busy}
      aria-label={on ? 'Location is on. Tap to refresh it.' : 'Share your location'}
      className={`label -my-2 flex min-h-[56px] items-center gap-2 rounded-full px-4
                  transition disabled:opacity-50 ${
                    on
                      ? 'border border-rule text-slate'
                      : 'bg-indigo text-paper'
                  }`}
    >
      <span
        className={`size-2 shrink-0 rounded-full ${on ? 'bg-indigo' : 'bg-paper'}`}
      />
      {busy ? 'Locating' : on ? 'Location on' : 'Share location'}
    </button>
  )
}
