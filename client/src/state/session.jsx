import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { api, readPlayer, writePlayer } from '../lib/api.js'
import { createSocket } from '../lib/socket.js'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [player, setPlayer] = useState(readPlayer)
  const [status, setStatus] = useState('idle')
  const [connection, setConnection] = useState('closed')
  const [players, setPlayers] = useState([])
  const [meta, setMeta] = useState(null)
  const [notice, setNotice] = useState(null)

  // Live-race state, unchanged in shape from the socket's point of view.
  const [incoming, setIncoming] = useState(null)
  const [outgoing, setOutgoing] = useState(null)
  const [match, setMatch] = useState(null)
  const [result, setResult] = useState(null)
  const [opponentProgress, setOpponentProgress] = useState(0)
  const [opponentFinished, setOpponentFinished] = useState(false)

  const socketRef = useRef(null)
  const playerId = player?.id ?? null

  /* -------------------------------------------------------------- bootstrap */

  useEffect(() => {
    api('/api/meta').then(setMeta).catch(() => {})
  }, [])

  // Revalidate the stored player on boot. A 404 means the id is dead (the
  // database was reset, say) so we clear it rather than hang on a dead id.
  const forget = useCallback(() => {
    writePlayer(null)
    setPlayer(null)
    setPlayers([])
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    if (!playerId) {
      setStatus('anonymous')
      return
    }
    let cancelled = false
    setStatus('loading')
    api('/api/me', { playerId })
      .then((data) => {
        if (cancelled) return
        setPlayer(data.player)
        writePlayer(data.player)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err.isUnknownPlayer) forget()
        // A network blip should not sign you out — keep the stored player and
        // let the socket's own reconnection handle it.
        else setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [playerId, forget])

  /* ----------------------------------------------------------------- socket */

  const onMessage = useCallback((frame) => {
    switch (frame.type) {
      case 'ready':
        setPlayer((prev) => {
          const next = { ...prev, ...frame.player }
          writePlayer(next)
          return next
        })
        break
      case 'players':
        setPlayers(frame.players)
        break
      case 'error':
        setNotice({ tone: 'bad', text: frame.message })
        break
      case 'challenge:sent':
        setOutgoing({ challengeId: frame.challengeId, opponent: frame.opponent, distanceM: frame.distanceM, expiresAt: frame.expiresAt })
        break
      case 'challenge:incoming':
        setIncoming({ challengeId: frame.challengeId, from: frame.from, distanceM: frame.distanceM, expiresAt: frame.expiresAt })
        break
      case 'challenge:declined':
        setOutgoing(null)
        setNotice({ tone: 'bad', text: `${frame.by.displayName} turned it down.` })
        break
      case 'challenge:cancelled':
        setIncoming(null)
        break
      case 'challenge:expired':
        setIncoming(null); setOutgoing(null)
        break
      case 'match:start':
        setIncoming(null); setOutgoing(null); setResult(null)
        setOpponentProgress(0); setOpponentFinished(false)
        setMatch({ id: frame.matchId, distanceM: frame.distanceM, startsAt: frame.startsAt, opponent: frame.opponent })
        break
      case 'match:tick':
        setOpponentProgress(frame.progressM)
        if (frame.finished) setOpponentFinished(true)
        break
      case 'match:end':
        setMatch(null)
        setPlayer(frame.player)
        writePlayer(frame.player)
        setResult({
          matchId: frame.matchId, outcome: frame.outcome, reason: frame.reason,
          ratingBefore: frame.ratingBefore, ratingAfter: frame.ratingAfter,
          elapsedMs: frame.elapsedMs, opponentElapsedMs: frame.opponentElapsedMs,
          opponent: frame.opponent,
        })
        break
      default:
        break
    }
  }, [])

  useEffect(() => {
    if (!playerId || status !== 'ready') return
    const socket = createSocket({
      playerId,
      onMessage,
      onStatus: setConnection,
      onDeadPlayer: forget,
    })
    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = null
      setConnection('closed')
    }
  }, [playerId, status, onMessage, forget])

  const send = useCallback((type, payload) => socketRef.current?.send(type, payload) ?? false, [])

  /* ---------------------------------------------------------------- actions */

  const join = useCallback(async (displayName, coords) => {
    const { player: joined } = await api('/api/join', {
      method: 'POST',
      body: { displayName, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
    })
    writePlayer(joined)
    setPlayer(joined)
    setStatus('ready')
    return joined
  }, [])

  /** Push a position. Silently does nothing useful if location was denied. */
  const pushLocation = useCallback(async (coords) => {
    if (!playerId || !coords) return null
    const { player: updated } = await api('/api/location', {
      method: 'POST', playerId, body: coords,
    })
    setPlayer(updated)
    writePlayer(updated)
    send('location', coords)
    return updated
  }, [playerId, send])

  const leave = useCallback(() => {
    socketRef.current?.close()
    forget()
  }, [forget])

  const value = useMemo(() => ({
    player, players, meta, status, connection, notice,
    incoming, outgoing, match, result, opponentProgress, opponentFinished,
    join, leave, pushLocation, send, setNotice, setOutgoing, setIncoming,
    clearResult: () => setResult(null),
  }), [
    player, players, meta, status, connection, notice, incoming, outgoing,
    match, result, opponentProgress, opponentFinished, join, leave,
    pushLocation, send,
  ])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider')
  return ctx
}
