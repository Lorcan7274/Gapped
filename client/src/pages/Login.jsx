import { useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { Button } from '../components/ui.jsx'

export default function Login() {
  const { signIn } = useSession()
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function requestCode(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api('/api/auth/request-code', {
        method: 'POST',
        body: { phone },
      })
      setDevCode(res.devCode ?? null)
      setStep('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api('/api/auth/verify', {
        method: 'POST',
        body: { phone, code },
      })
      signIn(res.token, res.player)
    } catch (err) {
      setError(err.message)
      setBusy(false)
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

      {step === 'phone' ? (
        <form onSubmit={requestCode} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Phone number
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 1111"
              className="nums w-full rounded-2xl border border-ink-700 bg-ink-900 px-4 py-4
                         text-xl text-ink-50 placeholder:text-ink-600
                         focus:border-surge-500 focus:outline-none"
            />
          </label>
          {error && <p className="text-sm text-flare-400">{error}</p>}
          <Button type="submit" size="lg" disabled={busy || phone.length < 8}>
            {busy ? 'Sending…' : 'Send code'}
          </Button>
          <p className="pb-2 text-center text-xs leading-relaxed text-ink-600">
            We use your number to sign you in and to keep one account per runner.
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Code sent to {phone}
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="nums w-full rounded-2xl border border-ink-700 bg-ink-900 px-4 py-4
                         text-center text-3xl tracking-[0.4em] text-ink-50
                         placeholder:text-ink-600 focus:border-surge-500 focus:outline-none"
            />
          </label>

          {devCode && (
            <p className="rounded-2xl bg-ink-850 px-4 py-3 text-center text-sm text-volt-400">
              Dev mode — your code is <span className="nums font-bold">{devCode}</span>
            </p>
          )}
          {error && <p className="text-sm text-flare-400">{error}</p>}

          <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Enter'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('phone')
              setCode('')
              setError(null)
            }}
            className="pb-2 text-center text-sm text-ink-400 underline underline-offset-4"
          >
            Use a different number
          </button>
        </form>
      )}
    </div>
  )
}
