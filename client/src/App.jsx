import { useEffect, useState } from 'react'
import { useSession } from './state/session.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Home from './pages/Home.jsx'
import Challenge from './pages/Challenge.jsx'
import Battle from './pages/Battle.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Profile from './pages/Profile.jsx'
import LocationButton from './components/LocationButton.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import ChallengeSheet from './components/ChallengeSheet.jsx'
import ResultSheet from './components/ResultSheet.jsx'
import RankBackground from './components/RankBackground.jsx'
import { Spinner, ConnectionStatus } from './components/ui.jsx'

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'lobby', label: 'Lobby' },
  { key: 'ladder', label: 'Ladder' },
  { key: 'you', label: 'You' },
]

export default function App() {
  const { player, status, connection, match, notice, setNotice } = useSession()
  const [tab, setTab] = useState('home')
  const [settingsOpen, setSettingsOpen] = useState(false)

  function go(key) {
    setTab(key)
    setSettingsOpen(false)
  }

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner />
      </div>
    )
  }

  if (status === 'anonymous') return <Onboarding />

  // A live duel owns the whole screen.
  if (match) {
    return (
      <>
        <Battle />
        {/* Call news (declined, dropped) has to reach a runner mid-duel too. */}
        {notice && (
          <div className="pointer-events-none fixed inset-x-0 top-20 z-50 mx-auto max-w-[430px] px-6">
            <p
              className={`toast-in border border-rule bg-paper px-5 py-3.5 text-center text-[13px] ${
                notice.tone === 'good' ? 'text-indigo' : 'text-garnet'
              }`}
            >
              {notice.text}
            </p>
          </div>
        )}
        <ResultSheet />
      </>
    )
  }

  // Home floats on the rank's live background; every other tab is paper.
  const glass = tab === 'home'

  return (
    <div className={`flex min-h-dvh flex-col ${glass ? 'rank-glass' : 'bg-paper'}`}>
      {glass && <RankBackground tier={player?.tier?.key} />}
      <header className="relative flex items-center justify-between border-b border-rule px-6 py-3 safe-t">
        {/* In a tab app the wordmark is redundant chrome on You — the gear
            takes its place and opens Settings there instead. */}
        {tab === 'you' ? (
          <button
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label={settingsOpen ? 'Close settings' : 'Settings'}
            aria-pressed={settingsOpen}
            className="-my-2 -ml-[17px] flex size-[56px] items-center justify-center text-ink"
          >
            <GearIcon />
          </button>
        ) : (
          <span className="label-13 label text-ink">Gapped</span>
        )}
        <div className="flex items-center gap-3">
          <ConnectionStatus status={connection} />
          <ThemeToggle className="-my-2" />
          <LocationButton />
        </div>
      </header>

      <main className="relative flex flex-1 flex-col pb-[92px]">
        {tab === 'home' && <Home onLobby={() => go('lobby')} />}
        {tab === 'lobby' && <Challenge />}
        {tab === 'ladder' && <Leaderboard />}
        {tab === 'you' && <Profile settingsOpen={settingsOpen} />}
      </main>

      {/* Notices float above the tab bar instead of shoving the layout down. */}
      {notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[104px] z-50 mx-auto max-w-[430px] px-6">
          <p
            className={`toast-in border border-rule bg-paper px-5 py-3.5 text-center text-[13px] ${
              notice.tone === 'good' ? 'text-indigo' : 'text-garnet'
            }`}
          >
            {notice.text}
          </p>
        </div>
      )}

      <nav
        className={`fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] flex border-t border-rule px-2 safe-b ${
          glass ? 'glass-nav' : 'bg-paper'
        }`}
      >
        {/* The active tab is marked by ink alone — no dot. */}
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => go(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`label flex min-h-[58px] flex-1 items-center justify-center transition ${
              tab === item.key ? 'text-ink' : 'text-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <ChallengeSheet />
      <ResultSheet />
    </div>
  )
}

/**
 * A cog outline: eight flat-topped teeth around a ring, with a hole. Built
 * from angles rather than drawn, so the teeth stay evenly spaced.
 */
const GEAR_PATH = (() => {
  const teeth = 8
  const outer = 10
  const inner = 7.4
  const pts = []
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const half = Math.PI / teeth
    // Root, tooth flank up, tooth top, flank down.
    for (const [r, da] of [[inner, -half * 0.62], [outer, -half * 0.36], [outer, half * 0.36], [inner, half * 0.62]]) {
      pts.push(`${(12 + r * Math.sin(a + da)).toFixed(2)},${(12 - r * Math.cos(a + da)).toFixed(2)}`)
    }
  }
  return `M${pts.join(' L')} Z`
})()

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden="true">
      <path d={GEAR_PATH} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
