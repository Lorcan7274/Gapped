import { useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentPosition } from '../lib/tracker.js'
import { usePhoneAuth } from '../lib/usePhoneAuth.js'
import {
  DIAL, detectCountry, rememberCountry, toE164, isCompleteNumber, formatNational,
} from '../lib/countries.js'
import Crystal, { Shard } from '../components/Crystal.jsx'
import Keypad from '../components/Keypad.jsx'
import CountryPicker, { FlagDisc } from '../components/CountryPicker.jsx'

const SPLASH_HOLD_MS = 1900
const SPLASH_LEAVE_MS = 1000

/** What the wrong-code sheet says, by what actually went wrong. */
function sheetFor(err) {
  if (err.code === 'code_expired') {
    return {
      title: 'That code expired',
      body: 'Codes only live a few minutes. Ask for a fresh one and try again.',
    }
  }
  if (err.code === 'code_locked') {
    return {
      title: 'Too many attempts',
      body: 'That number is locked for a bit. Ask for a fresh code and use the newest text.',
    }
  }
  if (err.code === 'code_invalid') {
    return {
      title: 'Incorrect code entered',
      body: 'Please check the code and try again',
    }
  }
  return { title: 'Something went wrong', body: err.message }
}

const CODE_ERRORS = new Set(['code_invalid', 'code_expired', 'code_locked'])

/**
 * The signed-out flow, start to finish: splash, a three-page welcome
 * carousel, then phone number, texted code and — when the number is new —
 * a username, on the app's own dial pad. Signing up and signing in are the
 * same path; the server decides which one the number means.
 */
export default function Onboarding() {
  const {
    stage: authStage, phone, setPhone, code, setCode,
    busy, error, devCode, resendIn, request, verify, back,
  } = usePhoneAuth()

  // enter → hold → out → done: the mark tightens in, holds, then the whole
  // sheet swells and dissolves onto the welcome screen.
  const [splash, setSplash] = useState('enter')
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState('create')
  const [needName, setNeedName] = useState(false)

  const [country, setCountry] = useState(detectCountry)
  const [national, setNational] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [pendingName, setPendingName] = useState(false)

  // The sheet's words survive its slide-out, so it never fades out blank.
  const [sheet, setSheet] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const triedRef = useRef('')

  const [page, setPage] = useState(0)
  const trackRef = useRef(null)

  const step = !started ? 'welcome' : needName ? 'name' : authStage

  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setSplash((s) => (s === 'enter' ? 'hold' : s)))
    )
    const leave = setTimeout(() => setSplash('out'), SPLASH_HOLD_MS)
    const done = setTimeout(() => setSplash('done'), SPLASH_HOLD_MS + SPLASH_LEAVE_MS)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(leave)
      clearTimeout(done)
    }
  }, [])

  /* ------------------------------------------------------------ phone entry */

  const phoneReady = isCompleteNumber(phone)

  function applyNational(next) {
    setNational(next)
    setPhone(toE164(country, next))
  }
  function typeDigit(d) {
    if (busy) return
    if (national.replace(/\D/g, '').length >= 15) return
    applyNational(national + d)
  }
  const typeBackspace = () => applyNational(national.slice(0, -1))
  // A leading + hands the whole number over as international, like the
  // profile's phone field does.
  const typePlus = () => {
    if (!national) applyNational('+')
  }

  function pickCountry(next) {
    setCountry(next)
    rememberCountry(next)
    setPhone(toE164(next, national))
    setPickerOpen(false)
  }

  function submitPhone() {
    if (phoneReady && !busy) request()
  }

  /* -------------------------------------------------------------- the code */

  const codeDigit = (d) => {
    if (!busy && !sheetOpen && code.length < 6) setCode(code + d)
  }
  const codeBackspace = () => {
    if (!busy && !sheetOpen) setCode(code.slice(0, -1))
  }

  // The sixth digit submits itself — a beat later, so the box fills first.
  useEffect(() => {
    if (step !== 'code' || busy || sheetOpen) return
    if (code.length !== 6 || triedRef.current === code) return
    const timer = setTimeout(async () => {
      triedRef.current = code
      const err = await verify({})
      if (!err) return
      if (err.code === 'name_required') {
        setNeedName(true)
        return
      }
      setSheet(sheetFor(err))
      setSheetOpen(true)
    }, 260)
    return () => clearTimeout(timer)
  }, [step, code, busy, sheetOpen, verify])

  function dismissSheet() {
    setSheetOpen(false)
    setCode('')
    triedRef.current = ''
  }

  /**
   * Resend from the code step. This step has no inline error line, so a
   * failed send (textbee down, network gone) rises as the sheet — except a
   * 429, whose retryInSeconds restarts the visible countdown and says it all.
   */
  async function resend() {
    triedRef.current = ''
    const err = await request()
    if (err && !err.retryInSeconds) {
      setSheet({ title: 'Could not send the code', body: err.message })
      setSheetOpen(true)
    }
  }

  function backToNumber() {
    setSheetOpen(false)
    triedRef.current = ''
    back()
  }

  function leaveToWelcome() {
    back()
    setNeedName(false)
    setStarted(false)
    setPickerOpen(false)
    setSheetOpen(false)
    triedRef.current = ''
  }

  // "+353 ·· 4567" — enough to recognise the number without printing it.
  const masked = useMemo(() => {
    const digits = phone.replace(/\D/g, '')
    const dial = DIAL[country] ?? ''
    const prefix = phone.startsWith(`+${dial}`) ? `+${dial}` : phone.slice(0, 4)
    return `${prefix} ·· ${digits.slice(-4)}`
  }, [phone, country])

  const resendClock = `${String(Math.floor(resendIn / 60)).padStart(2, '0')}:${String(resendIn % 60).padStart(2, '0')}`

  const boxes = [0, 1, 2, 3, 4, 5].map((i) => ({
    char: code[i] ?? '',
    live: !sheetOpen && !busy && i === code.length,
  }))

  /* ------------------------------------------------------------- your name */

  // Strip control characters (a paste can carry them) before the same
  // collapse the server applies — it rejects them as name_required, which
  // this screen has no way to show, so they must never be sent.
  // eslint-disable-next-line no-control-regex
  const collapsedName = displayName.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  const nameReady = collapsedName.length >= 2 && collapsedName.length <= 24
  const initials = (collapsedName.slice(0, 2) || 'GA').toUpperCase()

  async function submitName(event) {
    event.preventDefault()
    if (!nameReady || busy || pendingName) return
    setPendingName(true)
    try {
      // Ask for location so the new account lands on the map, but never let
      // a refusal block it.
      const coords = await getCurrentPosition().catch(() => null)
      const err = await verify({ displayName: collapsedName, coords })
      if (err && CODE_ERRORS.has(err.code)) {
        // The code died while they typed — back to the code step to explain.
        setNeedName(false)
        setCode('')
        triedRef.current = ''
        setSheet(sheetFor(err))
        setSheetOpen(true)
      }
    } finally {
      setPendingName(false)
    }
  }

  /* -------------------------------------------------------------- carousel */

  function onCarouselScroll() {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== page) setPage(next)
  }
  function goToPage(i) {
    const el = trackRef.current
    el?.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }
  function start(nextMode) {
    setMode(nextMode)
    setStarted(true)
  }

  const create = mode === 'create'

  return (
    <div className="ob">
      {/* ------------------------------------------------------- welcome */}
      {step === 'welcome' && (
        <div className="stage-in flex flex-1 flex-col">
          <header className="ob-top flex items-center gap-2.5 px-6">
            <Shard size={12} tone="sapphire" />
            <span className="text-[12px] font-700 uppercase tracking-[0.22em]">
              Welcome to Gapped
            </span>
          </header>

          <div ref={trackRef} onScroll={onCarouselScroll} className="ob-carousel">
            <section className="ob-slide w-full">
              <span className="ob-glow ob-glow--indigo" />
              <h1 className="ob-h1 mx-6 mt-5">Ready to rank your running?</h1>
              <div className="flex flex-1 items-center justify-center">
                <Crystal size={118} tone="sapphire" />
              </div>
            </section>

            <section className="ob-slide w-full">
              <span className="ob-glow ob-glow--green" />
              <h1 className="ob-h1 mx-6 mt-5">Duel runners near you, head to head</h1>
              <p className="mx-6 mt-3 text-[14px] leading-normal text-[#fafaf7]/60">
                One number the size of your palm: the live gap in metres between
                you and your opponent.
              </p>
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <span className="text-[11px] font-700 uppercase tracking-[0.22em] text-[#fafaf7]/55">
                  The gap
                </span>
                <span
                  className="display display-tight flex items-baseline text-[104px] text-[#4ade80]"
                  style={{ textShadow: '0 0 44px rgba(74,222,128,0.4)' }}
                >
                  +12
                  <span className="ml-2 text-[42px] font-700 tracking-[-0.02em]">m</span>
                </span>
                <span className="text-[13px] text-[#fafaf7]/55">
                  Green when you lead. Garnet when you trail.
                </span>
              </div>
            </section>

            <section className="ob-slide w-full">
              <span className="ob-glow ob-glow--violet" />
              <h1 className="ob-h1 mx-6 mt-5">Climb from Bronze to Diamond</h1>
              <p className="mx-6 mt-3 text-[14px] leading-normal text-[#fafaf7]/60">
                Ratings start at 1000. Win and yours climbs. That is the whole game.
              </p>
              <div className="flex flex-1 items-center justify-center px-6">
                <div className="flex items-end gap-4 border-b border-[#fafaf7]/20 px-5 pb-4">
                  <Shard size={20} tone="bronze" />
                  <Shard size={27} tone="silver" />
                  <Shard size={35} tone="gold" />
                  <Shard size={44} tone="sapphire" />
                  <Shard size={55} tone="amethyst" />
                  <Shard size={68} tone="diamond" />
                </div>
              </div>
            </section>
          </div>

          <div className="flex justify-center gap-[7px] pb-[18px]">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                aria-label={`Page ${i + 1}`}
                aria-current={page === i}
                onClick={() => goToPage(i)}
                className="-m-2 p-2"
              >
                <span className={`ob-dot block ${page === i ? 'is-on' : ''}`} />
              </button>
            ))}
          </div>

          <div className="ob-bottom flex flex-col gap-2.5 px-6">
            <button type="button" onClick={() => start('create')} className="ob-btn ob-btn--primary">
              Create account
            </button>
            <button type="button" onClick={() => start('login')} className="ob-btn ob-btn--ghost">
              Log in
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- phone number */}
      {step === 'number' && (
        <div className="stage-in flex flex-1 flex-col">
          <span className="ob-aurora" />
          <div className="ob-top px-3.5">
            <button
              type="button"
              aria-label="Back"
              onClick={leaveToWelcome}
              className="flex size-11 items-center justify-center"
            >
              <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden="true">
                <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <h1 className="ob-h1 ob-h1--step mx-6 mt-1">
            {create ? "Let's get started" : 'Welcome back'}
          </h1>
          <p className="mx-6 mt-2.5 text-[13px] leading-normal text-[#fafaf7]/60">
            {create
              ? 'Enter your phone number. We will text you a confirmation code there.'
              : 'Enter your phone number. We will text you a sign-in code there.'}
          </p>

          <div className="mx-6 mt-[18px] flex gap-2.5">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="Change country"
              className="ob-card flex min-h-[56px] items-center gap-2 px-3.5"
            >
              <FlagDisc code={country} size={26} />
              <span className="nums text-[16px] font-700">+{DIAL[country] ?? ''}</span>
              <svg viewBox="0 0 24 24" className="size-3.5 text-[#fafaf7]/50" aria-hidden="true">
                <path d="M6 9.5 L12 15.5 L18 9.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="ob-card nums flex min-h-[56px] min-w-0 flex-1 items-center overflow-hidden px-4 text-[17px]">
              {national ? (
                <>
                  <span className="whitespace-nowrap font-700">
                    {formatNational(country, national)}
                  </span>
                  <span className="ob-caret flex-none" />
                </>
              ) : (
                <span className="text-[#fafaf7]/40">Enter your phone</span>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMode(create ? 'login' : 'create')}
            className="mx-6 mt-4 self-start text-[13px] font-700 text-[#a5b4fc]"
          >
            {create ? 'Already have an account? Log in' : 'New here? Create account'}
          </button>

          {error && <p className="mx-6 mt-3 text-[13px] text-[#ff7aa2]">{error}</p>}

          <div className="flex-1" />

          <div className="px-6 pb-3">
            <button
              type="button"
              onClick={submitPhone}
              disabled={!phoneReady || busy}
              className={`ob-btn ${phoneReady ? 'ob-btn--primary' : 'ob-btn--dim'}`}
            >
              {busy ? 'Sending the code' : create ? 'Create account' : 'Log in'}
            </button>
          </div>
          <div className="ob-bottom">
            <Keypad onDigit={typeDigit} onBackspace={typeBackspace} onPlus={typePlus} />
          </div>

          <CountryPicker
            open={pickerOpen}
            current={country}
            onPick={pickCountry}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}

      {/* ------------------------------------------------------- the code */}
      {step === 'code' && (
        <div className="stage-in flex flex-1 flex-col">
          <span className="ob-aurora" />
          <div className="ob-top px-3.5">
            <button
              type="button"
              aria-label="Back"
              onClick={backToNumber}
              className="flex size-11 items-center justify-center"
            >
              <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden="true">
                <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <h1 className="ob-h1 ob-h1--step mx-6 mt-1">6-digit code</h1>
          <p className="nums mx-6 mt-2.5 text-[13px] leading-normal text-[#fafaf7]/60">
            Enter the code sent to {masked}
          </p>

          <div className="mx-6 mt-[22px] flex items-center gap-2" aria-label="Six-digit code">
            {boxes.slice(0, 3).map((b, i) => (
              <span key={i} className={`ob-box nums ${b.live ? 'is-live' : ''}`}>
                {b.char}
                {b.live && <span className="ob-caret ob-caret--box" />}
              </span>
            ))}
            <span className="h-0.5 w-2 rounded-full bg-[#fafaf7]/40" />
            {boxes.slice(3).map((b, i) => (
              <span key={i} className={`ob-box nums ${b.live ? 'is-live' : ''}`}>
                {b.char}
                {b.live && <span className="ob-caret ob-caret--box" />}
              </span>
            ))}
          </div>

          <p className="mx-6 mt-[18px] text-[13px] text-[#fafaf7]/55">
            {busy ? (
              'Checking the code'
            ) : resendIn > 0 ? (
              <>Resend code in <span className="nums">{resendClock}</span></>
            ) : (
              <button type="button" onClick={resend} className="ob-link">
                Resend code
              </button>
            )}
          </p>
          {devCode && (
            <p className="nums mx-6 mt-2 text-[12px] text-[#fafaf7]/40">
              No SMS provider in dev — your code is {devCode}
            </p>
          )}

          <div className="flex-1" />

          <div className="ob-bottom">
            <Keypad onDigit={codeDigit} onBackspace={codeBackspace} />
          </div>
        </div>
      )}

      {/* --------------------------------------------------- your profile */}
      {step === 'name' && (
        <form onSubmit={submitName} className="stage-in flex flex-1 flex-col">
          <span className="ob-aurora" />
          <div className="ob-top flex justify-end px-6">
            <button
              type="button"
              onClick={leaveToWelcome}
              className="min-h-[44px] text-[13px] font-700 text-[#fafaf7]/55"
            >
              Not now
            </button>
          </div>

          <div className="flex items-start justify-between gap-4 px-6 pt-2">
            <h1 className="ob-h1 ob-h1--step">Your profile</h1>
            <span className="relative flex size-11 flex-none items-center justify-center rounded-full bg-[#4f46e5] text-[15px] font-700 tracking-[0.04em]">
              {initials}
              <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#fafaf7]">
                <svg viewBox="0 0 24 24" className="size-2.5 text-[#101010]" aria-hidden="true">
                  <path d="M5 12.5 L10 17 L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
          </div>

          <p className="mx-6 mt-2.5 text-[13px] leading-normal text-[#fafaf7]/60">
            Set your username. It's how opponents see you on the ladder.
          </p>

          <div className="ob-card mx-6 mt-[18px] px-4 pb-3 pt-2.5">
            <label
              htmlFor="ob-name"
              className="block text-[10px] font-700 uppercase tracking-[0.18em] text-[#fafaf7]/50"
            >
              Username
            </label>
            <div className="mt-[3px] flex items-center text-[17px] font-700">
              <span aria-hidden="true">@</span>
              <input
                id="ob-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={24}
                autoComplete="nickname"
                autoFocus
                className="min-w-0 flex-1 bg-transparent caret-[#c4b5fd] placeholder:font-500 placeholder:text-[#fafaf7]/40 focus:outline-none"
                placeholder="username"
              />
            </div>
          </div>

          <div className="mx-6 mt-2.5 flex items-center justify-between text-[12px]">
            {nameReady ? (
              <span className="flex items-center gap-1.5 font-700 text-[#4ade80]">
                <svg viewBox="0 0 24 24" className="size-3" aria-hidden="true">
                  <path d="M4 12.5 L9.5 18 L20 6.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Username looks good
              </span>
            ) : displayName ? (
              <span className="font-700 text-[#ff7aa2]">At least 2 characters</span>
            ) : (
              <span className="text-[#fafaf7]/50">Letters, spaces, anything you like</span>
            )}
            <span className="nums text-[#fafaf7]/50">{displayName.length}/24</span>
          </div>

          {error && <p className="mx-6 mt-3 text-[13px] text-[#ff7aa2]">{error}</p>}

          <div className="flex-1" />

          <div className="ob-bottom px-6">
            <button
              type="submit"
              disabled={!nameReady || busy || pendingName}
              className={`ob-btn ${nameReady ? 'ob-btn--primary' : 'ob-btn--dim'}`}
            >
              {busy || pendingName ? 'Setting things up' : 'Continue'}
            </button>
          </div>
        </form>
      )}

      {/* --------------------------------------------------- wrong code */}
      <div className={`ob-sheet ${sheetOpen ? '' : 'is-hidden'}`} aria-hidden={!sheetOpen}>
        <span className="ob-sheet__scrim" onClick={dismissSheet} />
        <div className="ob-sheet__card" role="alertdialog" aria-label={sheet?.title}>
          <svg viewBox="0 0 24 24" className="size-[26px] text-[#ff4d6d]" aria-hidden="true">
            <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <p className="mt-2.5 text-center text-[19px] font-900 uppercase tracking-[-0.01em]">
            {sheet?.title ?? 'Incorrect code entered'}
          </p>
          <p className="mb-3 text-center text-[13px] text-[#fafaf7]/55">
            {sheet?.body ?? 'Please check the code and try again'}
          </p>
          <button
            type="button"
            onClick={dismissSheet}
            tabIndex={sheetOpen ? 0 : -1}
            className="ob-btn ob-btn--primary"
          >
            Got it
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------- the splash */}
      {splash !== 'done' && (
        <div
          className={`ob-splash ${splash === 'enter' ? 'is-enter' : ''} ${splash === 'out' ? 'is-out' : ''}`}
          aria-hidden="true"
        >
          <span className="ob-splash__glow" />
          <Shard size={88} tone="sapphire" />
          <span className="ob-splash__mark">Gapped</span>
        </div>
      )}
    </div>
  )
}
