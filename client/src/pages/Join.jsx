import { useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import Crystal from '../components/Crystal.jsx'
import { Button, Label } from '../components/ui.jsx'

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
    <div className="flex min-h-dvh flex-col justify-between bg-paper px-6 safe-t safe-b">
      <header className="pt-10">
        <Crystal size={70} />
        <h1 className="display mt-8 text-center text-[62px]">Gap</h1>
        <p className="mx-auto mt-3 max-w-[16rem] text-center text-[15px] leading-relaxed text-slate">
          Running has never had a rank mode.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="label text-muted">What should we call you?</span>
          <input
            type="text"
            autoComplete="nickname"
            maxLength={24}
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="min-h-[58px] w-full border-b border-ink bg-transparent pb-3
                       text-[22px] font-700 text-ink placeholder:text-muted
                       focus:outline-none"
          />
        </label>

        {error && <p className="text-[13px] text-garnet">{error}</p>}

        <Button type="submit" disabled={busy || name.trim().length < 2}>
          {busy ? (stage ?? 'Joining…') : 'Join'}
        </Button>

        <p className="pb-2 text-center text-[13px] leading-relaxed text-muted">
          We ask for your location so nearby runners can find you. Say no and you
          still get in — you just will not appear on anyone&apos;s radar.
        </p>
      </form>
    </div>
  )
}
