import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Debug from './pages/Debug.jsx'
import { SessionProvider } from './state/session.jsx'
import './index.css'

// The GPS test bench is unlinked and needs no player, so it is mounted above
// the session provider rather than as a screen inside the app.
const isDebug = window.location.pathname.replace(/\/+$/, '') === '/debug'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isDebug ? (
      <Debug />
    ) : (
      <SessionProvider>
        <App />
      </SessionProvider>
    )}
  </React.StrictMode>
)
