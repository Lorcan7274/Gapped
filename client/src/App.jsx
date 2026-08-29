import { useEffect, useState } from 'react'
import { useSession } from './state/session.jsx'
import Join from './pages/Join.jsx'
import Home from './pages/Home.jsx'
import Challenge from './pages/Challenge.jsx'
import Battle from './pages/Battle.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Profile from './pages/Profile.jsx'
import ChallengeSheet from './components/ChallengeSheet.jsx'
import ResultSheet from './components/ResultSheet.jsx'
import { Spinner, ConnectionDot } from './components/ui.jsx'

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'challenge', label: 'Challenge', icon: '⚔️' },
  { key: 'leaderboard', label: 'Ranks', icon: '🏆' },
  { key: 'profile', label: 'You', icon: '👤' },
]

export default function App() {
  const { status, connection, match, notice, setNotice } = useSession()
  const [tab, setTab] = useState('home')

  // Notices are transient; clear them so they do not pile up.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-950">
        <Spinner />
      </div>
    )
  }

  if (status === 'anonymous') return <Join />

  // A live race takes over the whole screen — nothing else matters mid-race.
  if (match) {
    return (
      <>
        <Battle />
        <ResultSheet />
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <header className="flex items-center justify-between border-b border-ink-800 px-4 py-3 safe-top">
        <span className="text-xl font-black tracking-tighter">Gap</span>
        <ConnectionDot status={connection} />
      </header>

      {notice && (
        <div
          className={`px-4 py-2 text-center text-sm ${
            notice.tone === 'bad'
              ? 'bg-flare-500/10 text-flare-400'
              : 'bg-surge-500/10 text-surge-400'
          }`}
          role="status"
        >
          {notice.text}
        </div>
      )}

      <main className="flex-1">
        {tab === 'home' && <Home />}
        {tab === 'challenge' && <Challenge />}
        {tab === 'leaderboard' && <Leaderboard />}
        {tab === 'profile' && <Profile />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-800
                   bg-ink-900/95 backdrop-blur safe-bottom"
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold
                        transition ${
                          tab === item.key ? 'text-surge-400' : 'text-ink-400'
                        }`}
          >
            <span className="text-lg" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <ChallengeSheet />
      <ResultSheet />
    </div>
  )
}
