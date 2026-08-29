import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { getCurrentPosition } from '../lib/tracker.js'
import { useSession } from '../state/session.jsx'
import { metres, distanceLabel, ago } from '../lib/format.js'
import { Button, Card, TierBadge, Spinner, EmptyState } from '../components/ui.jsx'

export default function Radar() {
  const { token, player, meta, send, outgoing, setOutgoing } = useSession()
  const [opponents, setOpponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api('/api/players/nearby', { token })
      setOpponents(data.players)
      setError(null)
    } catch (err) {
      setError(err)
      setOpponents([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
    // Discovery is a snapshot, so refresh it while the screen is open.
    const timer = setInterval(load, 20_000)
    return () => clearInterval(timer)
  }, [load])

  async function shareLocation() {
    setLocating(true)
    setError(null)
    try {
      const { lat, lng } = await getCurrentPosition()
      await api('/api/me/location', { method: 'POST', token, body: { lat, lng } })
      send('location', { lat, lng })
      await load()
    } catch (err) {
      setError(new Error(err.message || 'Could not read your location.'))
    } finally {
      setLocating(false)
    }
  }

  function challenge(opponent, distanceM) {
    send('challenge', { opponentId: opponent.id, distanceM })
    setPicking(null)
  }

  const needsLocation = error?.status === 409 || player?.hasLocation === false

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-black tracking-tight">Nearby</h2>
        <button
          onClick={shareLocation}
          disabled={locating}
          className="text-xs font-semibold uppercase tracking-wider text-surge-400 disabled:opacity-50"
        >
          {locating ? 'Locating…' : 'Update location'}
        </button>
      </div>

      {outgoing && (
        <Card className="border-volt-400/40 bg-volt-400/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-volt-400">
                Challenge sent to {outgoing.opponent.handle}
              </p>
              <p className="nums text-xs text-ink-400">
                {distanceLabel(outgoing.distanceM)} · waiting for them to accept
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                send('challenge:cancel', { challengeId: outgoing.challengeId })
                setOutgoing(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : needsLocation ? (
        <EmptyState
          icon="📍"
          title="Turn on location"
          body="Gap matches you with runners nearby. We only ever show others how far away you are, never where."
          action={
            <Button onClick={shareLocation} disabled={locating} className="mt-2">
              {locating ? 'Locating…' : 'Share my location'}
            </Button>
          }
        />
      ) : error ? (
        <EmptyState
          icon="⚠️"
          title="Could not load runners"
          body={error.message}
          action={
            <Button variant="ghost" onClick={load} className="mt-2">
              Try again
            </Button>
          }
        />
      ) : opponents.length === 0 ? (
        <EmptyState
          icon="🫥"
          title="Nobody in range"
          body={`No runners within ${metres(meta?.discovery.radiusM ?? 5000)} and ${
            meta?.discovery.ratingSpread ?? 250
          } rating of you are online right now.`}
          action={
            <Button variant="ghost" onClick={load} className="mt-2">
              Refresh
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {opponents.map((opponent) => (
            <li key={opponent.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{opponent.handle}</span>
                      <TierBadge tier={opponent.tier} />
                    </div>
                    <p className="nums mt-0.5 text-xs text-ink-400">
                      {opponent.rating} · {metres(opponent.distanceM)} away ·{' '}
                      {ago(opponent.lastSeenAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={Boolean(outgoing)}
                    onClick={() =>
                      setPicking(picking === opponent.id ? null : opponent.id)
                    }
                  >
                    {picking === opponent.id ? 'Close' : 'Race'}
                  </Button>
                </div>

                {picking === opponent.id && (
                  <div className="flex flex-wrap gap-2 border-t border-ink-800 pt-3">
                    {(meta?.distances ?? []).map((d) => (
                      <button
                        key={d}
                        onClick={() => challenge(opponent, d)}
                        className="nums rounded-xl border border-ink-600 px-3 py-2 text-sm
                                   font-semibold text-ink-200 transition
                                   hover:border-surge-500 hover:text-surge-400"
                      >
                        {distanceLabel(d)}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
