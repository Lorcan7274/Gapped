import { useState } from 'react'
import { getCurrentPosition } from '../lib/tracker.js'
import { usePhoneAuth } from '../lib/usePhoneAuth.js'
import {
  detectCountry, rememberCountry, toE164, isCompleteNumber, formatE164,
} from '../lib/countries.js'
import Crystal from '../components/Crystal.jsx'
import PhoneField from '../components/PhoneField.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { Button, Label } from '../components/ui.jsx'

const field =
  'min-h-[58px] w-full border-b border-ink bg-transparent pb-3 text-[19px] ' +
  'font-700 text-ink placeholder:text-muted focus:outline-none'

/**
 * Three screens, one flow: the crystal and a Get started button; then a
 * number; then the code that was texted to it. The number is the account,
 * so signing up and signing in are the same path — a name is only asked
 * for when the number turns out to be new.
 */
export default function Join() {
  const {
    stage: authStage, phone, setPhone, code, setCode,
    busy, error, devCode, resendIn, request, verify, back,
  } = usePhoneAuth()
  const [started, setStarted] = useState(false)
  const [country, setCountry] = useState(detectCountry)
  const [national, setNational] = useState('')
  const [displayName, setDisplayName] = useState('')
  // Sign-in with a number nobody owns yet: the server keeps the code alive
  // and asks for a name, so the same code creates the account.
  const [needName, setNeedName] = useState(false)

  const stage = started ? authStage : 'welcome'
  const phoneReady = isCompleteNumber(phone)
  const nameReady = displayName.trim().length >= 2

  function changeCountry(next) {
    setCountry(next)
    rememberCountry(next)
    setPhone(toE164(next, national))
  }
  function changeNational(next) {
    setNational(next)
    setPhone(toE164(country, next))
  }

  async function submitNumber(event) {
    event.preventDefault()
    if (phoneReady) request()
  }

  async function submitCode(event) {
    event.preventDefault()
    const extra = {}
    if (needName) {
      extra.displayName = displayName
      // Ask for location, but never let a refusal block the account.
      extra.coords = await getCurrentPosition().catch(() => null)
    }
    const err = await verify(extra)
    if (err?.code === 'name_required') setNeedName(true)
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-paper px-6 safe-t safe-b">
      <ThemeToggle className="absolute right-3 top-[max(0.5rem,env(safe-area-inset-top))]" />

      <header className={`join-hero ${stage === 'welcome' ? 'join-hero--full' : ''}`}>
        <Crystal size={stage === 'welcome' ? 84 : 52} />
        <h1 className="display join-title">Gapped</h1>
        <p className="join-tagline mx-auto max-w-[16rem] text-[15px] leading-relaxed text-slate">
          Running has never had a rank mode.
        </p>
      </header>

      {stage === 'welcome' && (
        <div className="stage-in flex flex-col gap-4 pb-2 pt-8">
          <Button onClick={() => setStarted(true)}>Get started</Button>
          <p className="text-center text-[13px] text-muted">
            Sign in or create an account with your phone number.
          </p>
        </div>
      )}

      {stage === 'number' && (
        <form onSubmit={submitNumber} className="stage-in flex flex-1 flex-col gap-6 pt-8">
          <div className="flex flex-col gap-2">
            <Label as="span">Phone number</Label>
            <PhoneField
              country={country}
              onCountry={changeCountry}
              national={national}
              onNational={changeNational}
              autoFocus
            />
            <span className="text-[13px] text-muted">
              We text a code, nothing else.
            </span>
          </div>

          {error && <p className="text-[13px] text-garnet">{error}</p>}

          <Button type="submit" disabled={busy || !phoneReady}>
            {busy ? 'Sending…' : 'Text me a code'}
          </Button>

          <button
            type="button"
            onClick={() => setStarted(false)}
            className="label min-h-[56px] text-muted"
          >
            Back
          </button>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={submitCode} className="stage-in flex flex-1 flex-col gap-6 pt-8">
          <div className="flex flex-col gap-2">
            <Label as="span">Enter the code</Label>
            <p className="text-[15px] text-slate">
              We texted <span className="nums text-ink">{formatE164(country, phone)}</span>.
            </p>
          </div>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            aria-label="Six-digit code"
            className={`nums ${field} text-center text-[32px] tracking-[0.4em]`}
          />

          {devCode && (
            <p className="nums text-center text-[13px] text-muted">
              No SMS provider in dev — your code is {devCode}
            </p>
          )}

          {needName && (
            <label className="flex flex-col gap-2">
              <Label as="span">Display name</Label>
              <p className="text-[13px] text-slate">
                That number is new here. Pick a name to create the account.
              </p>
              <input
                type="text"
                autoComplete="nickname"
                maxLength={24}
                required
                autoFocus
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className={field}
              />
            </label>
          )}

          {error && <p className="text-[13px] text-garnet">{error}</p>}

          <Button
            type="submit"
            disabled={busy || code.length !== 6 || (needName && !nameReady)}
          >
            {busy ? 'Checking…' : needName ? 'Create account' : 'Verify'}
          </Button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setNeedName(false); back() }}
              className="label min-h-[56px] text-muted"
            >
              Wrong number?
            </button>
            <button
              type="button"
              onClick={request}
              disabled={busy || resendIn > 0}
              className="label min-h-[56px] text-muted disabled:opacity-40"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
