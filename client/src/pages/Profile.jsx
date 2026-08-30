import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { usePhoneAuth } from '../lib/usePhoneAuth.js'
import {
  detectCountry, rememberCountry, toE164, isCompleteNumber,
} from '../lib/countries.js'
import { clock, distanceLabel, signed } from '../lib/format.js'
import { formatDuration } from '../lib/duelTypes.js'
import { Shard } from '../components/Crystal.jsx'
import PhoneField from '../components/PhoneField.jsx'
import { Button, Label, Rule, Spinner } from '../components/ui.jsx'

const field =
  'min-h-[56px] w-full border-b border-ink bg-transparent pb-2 text-[17px] ' +
  'font-700 text-ink placeholder:text-muted focus:outline-none'

/**
 * An account with no verified number lives entirely in this browser's
 * localStorage — leaving deletes it, clearing the browser loses it. Proving
 * a phone number attaches it to the account you already are, rating and all.
 */
function SecureAccount({ player, setNotice }) {
  const [open, setOpen] = useState(false)
  const {
    stage, phone, setPhone, code, setCode,
    busy, error, devCode, resendIn, request, verify, back,
  } = usePhoneAuth()
  const [country, setCountry] = useState(detectCountry)
  const [national, setNational] = useState('')

  const phoneReady = isCompleteNumber(phone)

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
    // The claim carries this account's id, so the name is only a fallback.
    const err = await verify({ displayName: player.displayName })
    if (!err) setNotice({ tone: 'good', text: 'Number verified. Sign in anywhere to pick this account up.' })
  }

  return (
    <div className="mt-8">
      <Rule />
      <div className="pt-4">
        <Label className="text-garnet">This account is tied to this device</Label>
        <p className="mt-2 text-[15px] leading-relaxed text-slate">
          Verify your phone number and your rating follows you anywhere.
        </p>
        {!open ? (
          <Button variant="outline" className="mt-4" onClick={() => setOpen(true)}>
            Secure account
          </Button>
        ) : stage === 'number' ? (
          <form onSubmit={submitNumber} className="mt-4 flex flex-col gap-4">
            <PhoneField
              size="md"
              country={country}
              onCountry={changeCountry}
              national={national}
              onNational={changeNational}
              autoFocus
            />
            {error && <p className="text-[13px] text-garnet">{error}</p>}
            <Button type="submit" disabled={busy || !phoneReady}>
              {busy ? 'Sending…' : 'Text me a code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="mt-4 flex flex-col gap-4">
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
              className={`nums ${field} text-center text-[24px] tracking-[0.4em]`}
            />
            {devCode && (
              <p className="nums text-[13px] text-muted">
                No SMS provider in dev — your code is {devCode}
              </p>
            )}
            {error && <p className="text-[13px] text-garnet">{error}</p>}
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Verify number'}
            </Button>
            <div className="flex items-center justify-between">
              <button type="button" onClick={back} className="label min-h-[56px] text-muted">
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
    </div>
  )
}

export default function Profile() {
  const { player, leave, setNotice } = useSession()
  const [matches, setMatches] = useState(null)

  useEffect(() => {
    if (!player) return
    api('/api/me/matches', { playerId: player.id })
      .then((d) => setMatches(d.matches))
      .catch(() => setMatches([]))
  }, [player?.id])

  if (!player) return null

  const anonymous = player.hasAccount === false

  return (
    <div className="px-6 pb-32 pt-6">
      <div className="flex items-center gap-4">
        <Shard size={34} />
        <div className="min-w-0">
          <h2 className="display truncate text-[34px]">{player.displayName}</h2>
          <p className="label mt-1 text-muted">{player.tier?.name}</p>
        </div>
      </div>

      <div className="mt-8 flex items-end justify-between border-y border-rule py-6">
        <div>
          <Label>Rating</Label>
          <p className="display mt-1.5 text-[56px]">{player.rating}</p>
        </div>
        <div className="text-right">
          <Label>Record</Label>
          <p className="display nums mt-1.5 text-[34px]">
            {player.wins}–{player.losses}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Label>Recent duels</Label>
        {matches === null ? (
          <div className="py-8"><Spinner /></div>
        ) : matches.length === 0 ? (
          <p className="mt-3 text-[15px] text-slate">
            No duels yet. Head to the lobby and challenge someone.
          </p>
        ) : (
          <ul className="mt-4">
            {matches.map((m, i) => {
              const won = m.winnerId === player.id
              const delta =
                m.you.ratingAfter != null ? m.you.ratingAfter - m.you.ratingBefore : null
              const terms = m.mode === 'timed'
                ? formatDuration((m.durationMs ?? 0) / 60_000)
                : distanceLabel(m.distanceM)
              return (
                <li key={m.id} className={i > 0 ? 'border-t border-rule' : ''}>
                  <div className="flex min-h-[56px] items-center gap-4 py-3.5">
                    <span className="label w-12 shrink-0 text-muted">
                      {m.winnerId == null ? 'Tie' : won ? 'Win' : 'Loss'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">
                        {m.opponent.displayName}
                      </p>
                      <p className="nums text-[13px] text-muted">
                        {terms}
                        {m.mode === 'timed'
                          ? ` · ${Math.round(m.you.progressM ?? 0)} m`
                          : m.you.elapsedMs != null
                            ? ` · ${clock(m.you.elapsedMs)}`
                            : ''}
                      </p>
                    </div>
                    {delta != null && (
                      <span
                        className={`nums shrink-0 text-[15px] font-700 ${
                          delta >= 0 ? 'text-indigo' : 'text-garnet'
                        }`}
                      >
                        {signed(delta)}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {anonymous && <SecureAccount player={player} setNotice={setNotice} />}

      <div className="mt-10">
        <Rule />
        {player.phone && (
          <p className="nums mt-4 text-[13px] text-muted">Verified as {player.phone}</p>
        )}
        <Button
          variant="quiet"
          className="mt-4"
          onClick={() => {
            if (
              !anonymous ||
              confirm(
                'This account has no verified number. Leaving deletes it — rating, record, all of it. Leave anyway?'
              )
            ) {
              leave()
            }
          }}
        >
          {anonymous ? 'Leave' : 'Sign out'}
        </Button>
      </div>
    </div>
  )
}
