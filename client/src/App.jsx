import { useEffect, useState } from 'react'
import { useSession } from './state/session.jsx'
import Join from './pages/Join.jsx'
import Home from './pages/Home.jsx'
import Challenge from './pages/Challenge.jsx'
import Battle from './pages/Battle.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Profile from './pages/Profile.jsx'
import LocationButton from './components/LocationButton.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import ChallengeSheet from './components/ChallengeSheet.jsx'
import ResultSheet from './components/ResultSheet.jsx'
import { Spinner, ConnectionStatus } from './components/ui.jsx'

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'lobby', label: 'Lobby' },
  { key: 'ladder', label: 'Ladder' },
  { key: 'you', label: 'You' },
]

export default function App() {
  const { status, connection, match, notice, setNotice } = useSession()
  const [tab, setTab] = useState('home')

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

  if (status === 'anonymous') return <Join />

  // A live duel owns the whole screen.
  if (match) {
    return (
      <>
        <Battle />
        <ResultSheet />
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-rule px-6 py-3 safe-t">
        <span className="label-13 label text-ink">Gapped</span>
        <div className="flex items-center gap-3">
          <ConnectionStatus status={connection} />
          <ThemeToggle className="-my-2" />
          <LocationButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-[92px]">
        {tab === 'home' && <Home onFindDuel={() => setTab('lobby')} />}
        {tab === 'lobby' && <Challenge />}
        {tab === 'ladder' && <Leaderboard />}
        {tab === 'you' && <Profile />}
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

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] flex border-t border-rule bg-paper px-2 safe-b">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`label flex min-h-[58px] flex-1 items-center justify-center transition ${
              tab === item.key ? 'text-ink' : 'text-muted'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {tab === item.key && <span className="size-1.5 rounded-full bg-indigo" />}
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      <ChallengeSheet />
      <ResultSheet />
    </div>
  )
}
