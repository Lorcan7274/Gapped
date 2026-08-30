import { useState } from 'react'
import { getCurrentPosition } from '../lib/tracker.js'
import { usePhoneAuth } from '../lib/usePhoneAuth.js'
import Crystal from '../components/Crystal.jsx'
import { Button, Label } from '../components/ui.jsx'

const field =
  'min-h-[58px] w-full border-b border-ink bg-transparent pb-3 text-[19px] ' +
  'font-700 text-ink placeholder:text-muted focus:outline-none'

/**
 * Join or sign back in: a display name plus a verified phone number. Enter
 * the number, prove it with a texted code, and the account — with its
 * rating — follows you to any device. No password to forget.
 */
export default function Join() {
  const {
    stage, phone, setPhone, code, setCode,
    busy, error, devCode, resendIn, request, verify, back,
  } = usePhoneAuth()
  const [mode, setMode] = useState('create')
  const [displayName, setDisplayName] = useState('')
  // Sign-in with a number nobody owns yet: the server keeps the code alive
  // and asks for a name, so the same code creates the account.
  const [needName, setNeedName] = useState(false)

  const creating = mode === 'create' || needName
  const nameReady = displayName.trim().length >= 2
  const phoneReady = phone.replace(/\D/g, '').length >= 8

  async function submitNumber(event) {
    event.preventDefault()
    if (phoneReady && (!creating || nameReady)) request()
  }

  async function submitCode(event) {
    event.preventDefault()
    const extra = {}
    if (creating) {
      extra.displayName = displayName
      // Ask for location, but never let a refusal block the account.
      extra.coords = await getCurrentPosition().catch(() => null)
    }
    const err = await verify(extra)
    if (err?.code === 'name_required') setNeedName(true)
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-paper px-6 safe-t safe-b">
      <header className="pt-8">
        <Crystal size={58} />
        <h1 className="display mt-6 text-center text-[54px]">Gapped</h1>
        <p className="mx-auto mt-2 max-w-[16rem] text-center text-[15px] leading-relaxed text-slate">
          Running has never had a rank mode.
        </p>
      </header>

      {stage === 'number' ? (
        <form onSubmit={submitNumber} className="flex flex-col gap-6 pt-6">
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
            <Label as="span">Phone number</Label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+353 87 123 4567"
              className={`nums ${field}`}
            />
            <span className="text-[13px] text-muted">
              Include the country code. We text a code, nothing else.
            </span>
          </label>

          {error && <p className="text-[13px] text-garnet">{error}</p>}

          <Button type="submit" disabled={busy || !phoneReady || (creating && !nameReady)}>
            {busy ? 'Sending…' : 'Text me a code'}
          </Button>

          <button
            type="button"
            onClick={() => setMode(creating ? 'signin' : 'create')}
            className="label min-h-[56px] text-muted"
          >
            {creating ? 'I already have an account' : 'Create an account instead'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-6 pt-6">
          <div className="flex flex-col gap-2">
            <Label as="span">Enter the code</Label>
            <p className="text-[15px] text-slate">
              We texted <span className="nums text-ink">{phone}</span>.
            </p>
          </div>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
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
