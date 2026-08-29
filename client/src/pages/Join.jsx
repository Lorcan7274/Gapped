import { useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import Crystal from '../components/Crystal.jsx'
import { Button, Label } from '../components/ui.jsx'

/**
 * Sign in or create an account. An email and password rather than a phone
 * code, so progress follows you to any device without needing an SMS
 * provider standing between a player and their own account.
 */
export default function Join() {
  const { register, login } = useSession()
  const [mode, setMode] = useState('register')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(null)
  const [error, setError] = useState(null)

  const creating = mode === 'register'
  const ready =
    email.includes('@') && password.length >= 8 &&
    (!creating || displayName.trim().length >= 2)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (creating) {
        // Ask for location, but never let a refusal block the account.
        setStage('Finding you…')
        const coords = await getCurrentPosition().catch(() => null)
        setStage('Creating account…')
        await register({ email, password, displayName, coords })
      } else {
        setStage('Signing in…')
        await login({ email, password })
      }
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setStage(null)
    }
  }

  const field =
    'min-h-[58px] w-full border-b border-ink bg-transparent pb-3 text-[19px] ' +
    'font-700 text-ink placeholder:text-muted focus:outline-none'

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-paper px-6 safe-t safe-b">
      <header className="pt-8">
        <Crystal size={58} />
        <h1 className="display mt-6 text-center text-[54px]">Gap</h1>
        <p className="mx-auto mt-2 max-w-[16rem] text-center text-[15px] leading-relaxed text-slate">
          Running has never had a rank mode.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-6 pt-6">
        {creating && (
          <label className="flex flex-col gap-2">
            <Label as="span">Display name</Label>
            <input
              type="text"
              autoComplete="nickname"
              maxLength={24}
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className={field}
            />
          </label>
        )}

        <label className="flex flex-col gap-2">
          <Label as="span">Email</Label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-2">
          <Label as="span">Password</Label>
          <input
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={creating ? 'At least 8 characters' : 'Your password'}
            className={field}
          />
        </label>

        {error && <p className="text-[13px] text-garnet">{error}</p>}

        <Button type="submit" disabled={busy || !ready}>
          {busy ? (stage ?? 'Working…') : creating ? 'Create account' : 'Sign in'}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(creating ? 'login' : 'register')
            setError(null)
          }}
          className="label min-h-[56px] text-muted"
        >
          {creating ? 'I already have an account' : 'Create an account instead'}
        </button>
      </form>
    </div>
  )
}
