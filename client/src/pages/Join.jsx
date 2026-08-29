import { useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import { Button } from '../components/ui.jsx'

export default function Join() {
  const { join } = useSession()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [stage, setStage] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    // Ask for location, but never let a refusal block the join. A player who
    // says no still gets in; they just will not show up on anyone's radar.
    let coords = null
    try {
      setStage('Finding you…')
      coords = await getCurrentPosition()
    } catch {
      coords = null
    }

    try {
      setStage('Joining…')
      await join(name, coords)
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setStage(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-ink-950 px-6 safe-top safe-bottom">
      <header className="pt-16">
        <h1 className="text-6xl font-black tracking-tighter text-ink-50">Gap</h1>
        <p className="mt-3 max-w-xs text-base leading-relaxed text-ink-400">
          Find the runners around you. Race them head to head. Close the gap.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            What should we call you?
          </span>
          <input
            type="text"
            autoComplete="nickname"
            maxLength={24}
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-2xl border border-ink-700 bg-ink-900 px-4 py-4
                       text-xl text-ink-50 placeholder:text-ink-600
                       focus:border-surge-500 focus:outline-none"
          />
        </label>

        {error && <p className="text-sm text-flare-400">{error}</p>}

        <Button type="submit" size="lg" disabled={busy || name.trim().length < 2}>
          {busy ? (stage ?? 'Joining…') : 'Join'}
        </Button>

        <p className="pb-2 text-center text-xs leading-relaxed text-ink-600">
          We ask for your location so nearby runners can find you. Say no and you
          still get in — you just will not appear on anyone&apos;s radar.
        </p>
      </form>
    </div>
  )
}
