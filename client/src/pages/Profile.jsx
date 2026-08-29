import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useSession } from '../state/session.jsx'
import { clock, distanceLabel, signed } from '../lib/format.js'
import { formatDuration } from '../lib/duelTypes.js'
import { Shard } from '../components/Crystal.jsx'
import { Button, Label, Rule, Spinner } from '../components/ui.jsx'

/**
 * An account with no email attached lives entirely in this phone's
 * localStorage — leaving deletes it, clearing the browser loses it. This
 * form attaches credentials to the account you already are, rating and all.
 */
function SecureAccount({ player, register, setNotice }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register({ email, password, displayName: player.displayName })
      setNotice({ tone: 'good', text: 'Account secured. Sign in anywhere to pick it up.' })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const field =
    'min-h-[56px] w-full border-b border-ink bg-transparent pb-2 text-[17px] ' +
    'font-700 text-ink placeholder:text-muted focus:outline-none'

  return (
    <div className="mt-8">
      <Rule />
      <div className="pt-4">
        <Label className="text-garnet">This account lives on this phone only</Label>
        <p className="mt-2 text-[15px] leading-relaxed text-slate">
          Add an email and password and your rating follows you to any device.
        </p>
        {!open ? (
          <Button variant="outline" className="mt-4" onClick={() => setOpen(true)}>
            Secure account
          </Button>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
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
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={field}
            />
            {error && <p className="text-[13px] text-garnet">{error}</p>}
            <Button type="submit" disabled={busy || !email.includes('@') || password.length < 8}>
              {busy ? 'Securing…' : 'Attach email'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function Profile() {
  const { player, leave, register, setNotice } = useSession()
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

      {anonymous && (
        <SecureAccount player={player} register={register} setNotice={setNotice} />
      )}

      <div className="mt-10">
        <Rule />
        <Button
          variant="quiet"
          className="mt-4"
          onClick={() => {
            if (
              !anonymous ||
              confirm(
                'This account has no email attached. Leaving deletes it — rating, record, all of it. Leave anyway?'
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
