import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../state/session.jsx'
import { getCurrentPosition } from '../lib/tracker.js'
import { formatsFrom, formatDetail, challengePayload, describe } from '../lib/duelTypes.js'
import Crystal, { Shard } from '../components/Crystal.jsx'
import TierLadder from '../components/TierLadder.jsx'
import DuelSetup from '../components/DuelSetup.jsx'
import DuelSheet from '../components/DuelSheet.jsx'
import { Button, Label, Rule, Spinner } from '../components/ui.jsx'

export default function Home({ onLobby }) {
  const {
    player, players, meta, send, setNotice, pushLocation,
    queued, joinQueue, leaveQueue,
  } = useSession()
  const [formatKey, setFormatKey] = useState('race')
  const [ladderOpen, setLadderOpen] = useState(false)
  const [setup, setSetup] = useState(null)
  const [duelOpen, setDuelOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCurrentPosition()
      .then((coords) => !cancelled && pushLocation(coords))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pushLocation])

  // The nemesis is your closest rival you could race right now: nearest on
  // rating, online, and inside the challenge radius. distanceM is null when
  // either side has no location, which also rules a runner out.
  const nemesis = useMemo(() => {
    const radiusM = meta?.discovery?.radiusM ?? 5000
    const rivals = players.filter(
      (p) =>
        p.id !== player?.id &&
        p.online &&
        p.distanceM != null &&
        p.distanceM <= radiusM
    )
    if (rivals.length === 0) return null
    return [...rivals].sort(
      (a, b) => (a.ratingGap ?? Infinity) - (b.ratingGap ?? Infinity)
    )[0]
  }, [players, player?.id, meta])

  if (!player) return null

  // While searching, the live search is the selection — the dot must not
  // drift from what the server is actually matching.
  const formats = formatsFrom(meta)
  const activeKey = queued ?? formatKey
  const selected = formats.find((f) => f.key === activeKey) ?? formats[0]

  /** A direct challenge — the only place the full custom menu lives. */
  function confirm(shape) {
    const opponent = setup?.opponent
    setSetup(null)
    if (!opponent) return
    // send() is false when the socket is down — nothing reached the server,
    // so claiming "sent" would leave them waiting on a challenge nobody got.
    const sent = send('challenge', challengePayload(opponent.id, shape))
    setNotice(sent
      ? { tone: 'good', text: `Challenge sent · ${describe(shape)}` }
      : { tone: 'bad', text: 'Not connected. Try again in a moment.' })
  }

  function search(key) {
    if (!joinQueue(key)) {
      setNotice({ tone: 'bad', text: 'Not connected. Try again in a moment.' })
    }
  }

  const caption =
    `${selected.name ?? selected.key} · ${formatDetail(selected)} · match within ` +
    `${meta?.discovery?.ratingSpread ?? 250} rating`

  function chooseFormat(key) {
    setFormatKey(key)
    // Switching format mid-search moves the search, not just the dot.
    if (queued && queued !== key) search(key)
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-2">
      {/* Crystal and rating are one thing — one tap opens the full ladder. */}
      <button
        onClick={() => setLadderOpen(true)}
        aria-label="See all ranks"
        className="flex w-full flex-col items-center gap-1.5 pt-3 text-center"
      >
        <Crystal size={62} tone={player.tier?.key ?? 'sapphire'} />
        <Label className="mt-3">Rating</Label>
        <p className="display num-glow text-[62px]">{player.rating}</p>
        <p className="label-13 label text-ink">{player.tier?.name}</p>
        <p className="text-[13px] text-slate">Tap for all ranks</p>
      </button>

      {/* Nemesis */}
      <div className="mt-3.5">
        <Rule />
        {nemesis ? (
          <div className="flex items-center gap-4 py-3">
            <NemesisShard />
            <div className="min-w-0 flex-1">
              <Label className="text-garnet">Nemesis</Label>
              <p className="mt-1 truncate text-[17px] font-700 text-ink">
                {nemesis.displayName}
              </p>
              <p className="nums text-[13px] text-muted">
                {nemesis.rating} · {nemesis.ratingGap ?? 0} apart
              </p>
            </div>
            <button
              onClick={() => setSetup({ opponent: nemesis })}
              className="btn btn-primary w-auto shrink-0 px-6 text-[13px]"
            >
              Challenge
            </button>
          </div>
        ) : (
          <p className="py-4 text-[15px] text-slate">
            {players.length > 1
              ? 'No nemesis right now. Nobody close by is online.'
              : 'No nemesis yet. Nobody else has joined.'}
          </p>
        )}
        <Rule />
      </div>

      {/* Quick match: two fixed formats, nothing to tune. Custom shapes live
          behind a direct challenge, so the random pool never splinters. */}
      <div className="mt-1">
        {formats.map((option, i) => (
          <div key={option.key}>
            {i > 0 && <Rule />}
            <button
              onClick={() => chooseFormat(option.key)}
              className="flex min-h-[56px] w-full items-center gap-4 py-3 text-left"
            >
              <span
                className={`size-2.5 shrink-0 rounded-full border ${
                  activeKey === option.key ? 'border-ink bg-ink' : 'border-muted'
                }`}
              />
              <span className="flex-1">
                <span
                  className={`block text-[16px] ${
                    activeKey === option.key ? 'font-700 text-ink' : 'text-muted'
                  }`}
                >
                  {option.name ?? option.key}
                </span>
                <span className="block text-[13px] text-muted">{option.blurb}</span>
              </span>
              <span className="nums text-[13px] text-muted">{formatDetail(option)}</span>
            </button>
          </div>
        ))}
        <Rule />
      </div>

      {/* Duel opens the split sheet: a random lobby on top, a chosen rival
          below. While a search runs, the same spot cancels it. */}
      <div className="mt-auto flex flex-col gap-2.5 py-3.5">
        {queued ? (
          <Button variant="outline" onClick={leaveQueue}>
            <Spinner />
            Searching · tap to cancel
          </Button>
        ) : (
          <Button onClick={() => setDuelOpen(true)}>Duel</Button>
        )}
        <p className="text-center text-[13px] text-muted">{caption}</p>
      </div>

      <DuelSheet
        open={duelOpen}
        caption={caption}
        onRandom={() => search(selected.key)}
        onFriend={onLobby}
        onClose={() => setDuelOpen(false)}
      />

      {ladderOpen && <TierLadder onClose={() => setLadderOpen(false)} />}
      {setup && (
        <DuelSetup
          opponent={setup.opponent}
          onConfirm={confirm}
          onClose={() => setSetup(null)}
        />
      )}
    </div>
  )
}

/* Crimson void-beams flashing down around the nemesis stone, each on its own
   cycle so the pattern never visibly repeats. */
const NEMESIS_BEAMS = [
  { left: -11, top: '-15%', width: 2.5, height: '82%', hue: '255,77,109', peak: 0.85, glow: 4, shadow: 0.6, dur: '3.1s', delay: '0s' },
  { left: -5, top: '6%', width: 1.5, height: '52%', hue: '255,122,162', peak: 0.8, glow: 3, shadow: 0.5, dur: '4.3s', delay: '1.4s' },
  { left: 9, top: '-22%', width: 2, height: '44%', hue: '255,77,109', peak: 0.75, glow: 4, shadow: 0.5, dur: '2.3s', delay: '0.7s' },
  { right: -4, top: '0%', width: 3, height: '66%', hue: '255,77,109', peak: 0.9, glow: 5, shadow: 0.6, dur: '3.7s', delay: '2.1s' },
  { right: -10, top: '-8%', width: 1.5, height: '58%', hue: '255,122,162', peak: 0.8, glow: 3, shadow: 0.5, dur: '4.9s', delay: '3.2s' },
]

function NemesisShard() {
  return (
    <span className="relative block shrink-0">
      <Shard size={22} tone="garnet" />
      {NEMESIS_BEAMS.map((b, i) => (
        <span
          key={i}
          className="gemfx gemfx--beam"
          style={{
            left: b.left, right: b.right, top: b.top, width: b.width, height: b.height,
            background: `linear-gradient(180deg, rgba(${b.hue},0), rgba(${b.hue},${b.peak}) ${b.hue === '255,122,162' ? 35 : 30}%, rgba(${b.hue === '255,122,162' ? b.hue : '164,63,94'},0))`,
            boxShadow: `0 0 ${b.glow}px rgba(${b.hue},${b.shadow})`,
            animationDuration: b.dur, animationDelay: b.delay,
          }}
        />
      ))}
    </span>
  )
}
