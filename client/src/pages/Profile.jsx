import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { usePhoneAuth } from '../lib/usePhoneAuth.js'
import {
  detectCountry, rememberCountry, toE164, isCompleteNumber,
} from '../lib/countries.js'
import { clock, distanceLabel, daysAgo } from '../lib/format.js'
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

export default function Profile({ settingsOpen = false }) {
  const { player, setNotice } = useSession()
  const [matches, setMatches] = useState(null)

  useEffect(() => {
    if (!player) return
    api('/api/me/matches', { playerId: player.id })
      .then((d) => setMatches(d.matches))
      .catch(() => setMatches([]))
  }, [player?.id])

  if (!player) return null
  if (settingsOpen) return <Settings player={player} setNotice={setNotice} />

  const anonymous = player.hasAccount === false
  // Oldest first, and only duels that actually moved the rating.
  const settled = (matches ?? [])
    .filter((m) => m.you.ratingAfter != null && m.you.ratingBefore != null)
    .slice(0, CHART_DUELS)
    .reverse()

  return (
    <div className="px-6 pb-32 pt-6">
      <div className="flex items-center gap-4">
        <Shard size={34} tone={player.tier?.key ?? 'sapphire'} />
        <div className="min-w-0">
          <h2 className="display truncate text-[34px]">{player.displayName}</h2>
          <p className="label mt-1 text-muted">{player.tier?.name}</p>
        </div>
      </div>

      {/* 1428 needs a past: the chart turns the number into a trajectory. */}
      <div className="mt-7 border-y border-rule py-5">
        <div className="flex items-end justify-between gap-5">
          <div>
            <Label>Rating</Label>
            <p className="display mt-1.5 text-[56px]">{player.rating}</p>
          </div>
          {settled.length > 0 && (
            <Label>Last {settled.length} {settled.length === 1 ? 'duel' : 'duels'}</Label>
          )}
        </div>
        {settled.length > 0 && <RatingChart duels={settled} playerId={player.id} />}
      </div>

      <div className="mt-7">
        <Label>Recent duels</Label>
        {matches === null ? (
          <div className="py-8"><Spinner /></div>
        ) : matches.length === 0 ? (
          <p className="mt-3 text-[15px] text-slate">
            No duels yet. Head to the lobby and challenge someone.
          </p>
        ) : (
          <ul className="mt-2.5">
            {matches.map((m, i) => (
              <DuelRow key={m.id} match={m} playerId={player.id} divided={i > 0} />
            ))}
          </ul>
        )}
      </div>

      {anonymous && <SecureAccount player={player} setNotice={setNotice} />}
    </div>
  )
}

const CHART_DUELS = 8

const outcomeOf = (m, playerId) =>
  m.winnerId == null ? 'tie' : m.winnerId === playerId ? 'win' : 'loss'

const OUTCOME = {
  win: { word: 'Win', text: 'text-win', stroke: 'var(--color-win)' },
  loss: { word: 'Loss', text: 'text-garnet', stroke: 'var(--color-loss)' },
  tie: { word: 'Tie', text: 'text-muted', stroke: 'var(--color-muted)' },
}

/** +14, −11, ±0 — a true minus sign, and a tie that claims neither side. */
const delta = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0')

/**
 * One row of history. Every row leads with the mode, then your result in
 * that mode, so the column scans the same way whichever mode it was.
 */
function DuelRow({ match: m, playerId, divided }) {
  const outcome = OUTCOME[outcomeOf(m, playerId)]
  const change = m.you.ratingAfter != null ? m.you.ratingAfter - m.you.ratingBefore : null
  const detail =
    m.mode === 'timed'
      ? `Distance ${clock(m.durationMs)} · ${Math.round(m.you.progressM ?? 0)} m`
      : `Race ${distanceLabel(m.distanceM)}${m.you.elapsedMs != null ? ` · ${clock(m.you.elapsedMs)}` : ''}`
  const tone = change > 0 ? 'text-win' : change < 0 ? 'text-garnet' : 'text-muted'

  return (
    <li className={divided ? 'border-t border-rule' : ''}>
      <div className="flex min-h-[56px] items-center gap-3.5 py-[9px]">
        <span className={`label w-11 shrink-0 tracking-[0.18em] ${outcome.text}`}>{outcome.word}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{m.opponent.displayName}</p>
          <p className="nums mt-0.5 text-[13px] text-muted">{detail}</p>
        </div>
        <div className="shrink-0 text-right">
          {change != null && (
            <p className={`nums text-[15px] font-700 ${tone}`}>{delta(change)}</p>
          )}
          <p className="mt-0.5 text-[12px] text-muted">
            {daysAgo(m.finishedAt ?? m.startedAt)}
          </p>
        </div>
      </div>
    </li>
  )
}

/* Plot box inside the 354×140 viewBox: axes on the left and bottom, dates
   under the x axis, ratings beside the y axis. */
const X0 = 34
const X1 = 348
const Y_TOP = 12
const Y_BOTTOM = 103
const AXIS_Y = 112
const STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500]

/**
 * Rating over the last few duels, one segment per duel coloured by its
 * outcome — green for a win, red for a loss, grey for a tie — so streaks
 * read at a glance. Gridlines land on round ratings.
 */
function RatingChart({ duels, playerId }) {
  const ratings = [duels[0].you.ratingBefore, ...duels.map((m) => m.you.ratingAfter)]
  const lo = Math.min(...ratings)
  const hi = Math.max(...ratings)
  const step = STEPS.find((s) => (hi - lo) / s <= 3) ?? 1000
  const floor = Math.floor(lo / step) * step
  const ceil = Math.max(Math.ceil(hi / step) * step, floor + step)
  const y = (r) => Y_BOTTOM - ((r - floor) / (ceil - floor)) * (Y_BOTTOM - Y_TOP)
  const x = (i) => X0 + (i / (ratings.length - 1)) * (X1 - X0)
  const grid = []
  for (let r = floor + step; r <= ceil; r += step) grid.push(r)
  const when = (m) => daysAgo(m.finishedAt ?? m.startedAt)
  const mid = duels[Math.floor((duels.length - 1) / 2)]

  return (
    <svg
      viewBox="0 0 354 140"
      className="mt-4 block h-[140px] w-full"
      role="img"
      aria-label={`Rating went from ${ratings[0]} to ${ratings[ratings.length - 1]} over the last ${duels.length} duels`}
    >
      {grid.map((r) => (
        <g key={r}>
          <line x1={X0} y1={y(r)} x2={X1} y2={y(r)} stroke="var(--color-rule)" strokeDasharray="3 4" />
          <text x="28" y={y(r) + 3.2} textAnchor="end" className="nums" fontSize="10" fill="var(--color-muted)">
            {r}
          </text>
        </g>
      ))}
      <line x1={X0} y1="6" x2={X0} y2={AXIS_Y} stroke="var(--color-slate)" />
      <line x1={X0} y1={AXIS_Y} x2={X1} y2={AXIS_Y} stroke="var(--color-slate)" />
      {duels.map((m, i) => (
        <line
          key={m.id}
          x1={x(i)} y1={y(ratings[i])} x2={x(i + 1)} y2={y(ratings[i + 1])}
          stroke={OUTCOME[outcomeOf(m, playerId)].stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}
      <circle cx={X1} cy={y(ratings[ratings.length - 1])} r="3.5" fill="var(--color-ink)" />
      <text x={X0} y="130" fontSize="10" fill="var(--color-muted)">{when(duels[0])}</text>
      {duels.length > 2 && (
        <text x={(X0 + X1) / 2} y="130" textAnchor="middle" fontSize="10" fill="var(--color-muted)">
          {when(mid)}
        </text>
      )}
      <text x={X1} y="130" textAnchor="end" fontSize="10" fill="var(--color-muted)">
        {when(duels[duels.length - 1])}
      </text>
    </svg>
  )
}

/**
 * The gear on the You tab opens this in place of the profile: the name you
 * race under, the number you are verified as, and the way out.
 */
function Settings({ player, setNotice }) {
  const { leave, rename } = useSession()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(player.displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const anonymous = player.hasAccount === false

  async function save(event) {
    event.preventDefault()
    const next = name.trim()
    if (next === player.displayName) return setEditing(false)
    setBusy(true)
    setError(null)
    try {
      await rename(next)
      setEditing(false)
      setNotice({ tone: 'good', text: 'Name updated.' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-6 pb-32 pt-6">
      <h2 className="display text-[34px]">Settings</h2>

      <div className="mt-7 border-t border-rule">
        {editing ? (
          <form onSubmit={save} className="flex flex-col gap-3 border-b border-rule py-4">
            <Label>Display name</Label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoFocus
              autoComplete="nickname"
              aria-label="Display name"
              className={field}
            />
            {error && <p className="text-[13px] text-garnet">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="quiet"
                onClick={() => {
                  setEditing(false)
                  setName(player.displayName)
                  setError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex min-h-[56px] w-full items-center justify-between gap-4 border-b border-rule py-2 text-left"
          >
            <span className="text-[15px]">Display name</span>
            <span className="truncate text-[15px] text-slate">{player.displayName}</span>
          </button>
        )}
      </div>

      <div className="mt-10 border-t border-rule">
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
