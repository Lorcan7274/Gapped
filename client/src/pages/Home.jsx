import { useEffect, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import { metres, ago } from '../lib/format.js'
import { Card, TierBadge, EmptyState, Button } from '../components/ui.jsx'

export default function Home() {
  const { player, players, pushLocation } = useSession()
  const [locating, setLocating] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)

  // Refresh position every time this screen mounts, as well as at join.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLocating(true)
      try {
        const coords = await getCurrentPosition()
        if (!cancelled) {
          await pushLocation(coords)
          setLocationDenied(false)
        }
      } catch {
        if (!cancelled) setLocationDenied(true)
      } finally {
        if (!cancelled) setLocating(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pushLocation])

  async function retryLocation() {
    setLocating(true)
    try {
      await pushLocation(await getCurrentPosition())
      setLocationDenied(false)
    } catch {
      setLocationDenied(true)
    } finally {
      setLocating(false)
    }
  }

  if (!player) return null

  const others = players.filter((p) => p.id !== player.id)
  const online = others.filter((p) => p.online).length

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      {/* You */}
      <Card className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-400">
            You
          </p>
          <h2 className="truncate text-2xl font-black tracking-tight">
            {player.displayName}
          </h2>
          <div className="mt-1.5">
            <TierBadge tier={player.tier} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-400">
            Rating
          </p>
          <p className="nums text-4xl font-black leading-none">{player.rating}</p>
        </div>
      </Card>

      {(locationDenied || player.hasLocation === false) && (
        <Card className="border-volt-400/40 bg-volt-400/5">
          <p className="text-sm font-semibold text-volt-400">
            Location is off
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            You are in, but nobody can find you to race. Turn location on and
            you will show up on their radar.
          </p>
          <Button size="sm" variant="ghost" className="mt-3" onClick={retryLocation} disabled={locating}>
            {locating ? 'Locating…' : 'Turn on location'}
          </Button>
        </Card>
      )}

      {/* Everyone else */}
      <div className="flex items-baseline justify-between pt-1">
        <h3 className="text-lg font-black tracking-tight">Runners</h3>
        <span className="nums text-xs text-ink-400">
          {online} online · {others.length} joined
        </span>
      </div>

      {others.length === 0 ? (
        <EmptyState
          icon="🫥"
          title="Nobody else yet"
          body="You are the first one here. Open Gap on another phone and that runner will appear in this list the moment they join — no refresh needed."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {others.map((p) => (
            <li key={p.id}>
              <Card className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      p.online ? 'bg-surge-500' : 'bg-ink-600'
                    }`}
                    title={p.online ? 'Online' : 'Offline'}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{p.displayName}</span>
                      <TierBadge tier={p.tier} />
                    </div>
                    <p className="nums mt-0.5 text-xs text-ink-400">
                      {p.rating}
                      {p.distanceM != null && ` · ${metres(p.distanceM)} away`}
                      {!p.hasLocation && ' · no location'}
                      {!p.online && ` · ${ago(p.lastSeenAt)}`}
                    </p>
                  </div>
                </div>
                <span className="nums shrink-0 text-xs text-ink-600">
                  {p.wins}W {p.losses}L
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
