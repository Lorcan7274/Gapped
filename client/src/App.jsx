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

const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315]

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[21px]" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        {GEAR_TEETH.map((angle) => (
          <line key={angle} x1="12" y1="2.6" x2="12" y2="5.2" transform={`rotate(${angle} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  )
}
