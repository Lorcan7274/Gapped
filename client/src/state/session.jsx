import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { api, readToken, writeToken } from '../lib/api.js'
import { createSocket } from '../lib/socket.js'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [token, setToken] = useState(readToken)
  const [player, setPlayer] = useState(null)
  const [meta, setMeta] = useState(null)
  const [status, setStatus] = useState('idle')
  const [connection, setConnection] = useState('closed')

  // Live-battle state, driven entirely by socket frames.
  const [incoming, setIncoming] = useState(null) // challenge aimed at us
  const [outgoing, setOutgoing] = useState(null) // challenge we sent
  const [match, setMatch] = useState(null)
  const [result, setResult] = useState(null)
  const [opponentProgress, setOpponentProgress] = useState(0)
  const [opponentFinished, setOpponentFinished] = useState(false)
  const [notice, setNotice] = useState(null)

  const socketRef = useRef(null)

  /* ------------------------------------------------------------ bootstrap */

  useEffect(() => {
    api('/api/meta').then(setMeta).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) {
      setPlayer(null)
      setStatus('anonymous')
      return
    }
    let cancelled = false
    setStatus('loading')
    api('/api/me', { token })
      .then((data) => {
        if (cancelled) return
        setPlayer(data.player)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        writeToken(null)
        setToken(null)
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  /* --------------------------------------------------------------- socket */

  const onMessage = useCallback((frame) => {
    switch (frame.type) {
      case 'ready':
        setPlayer(frame.player)
        break

      case 'error':
        setNotice({ tone: 'bad', text: frame.message })
        break

      case 'challenge:sent':
        setOutgoing({
          challengeId: frame.challengeId,
          opponent: frame.opponent,
          distanceM: frame.distanceM,
          expiresAt: frame.expiresAt,
        })
        break

      case 'challenge:incoming':
        setIncoming({
          challengeId: frame.challengeId,
          from: frame.from,
          distanceM: frame.distanceM,
          expiresAt: frame.expiresAt,
        })
        break

      case 'challenge:declined':
        setOutgoing(null)
        setNotice({ tone: 'bad', text: `${frame.by.handle} turned it down.` })
        break

      case 'challenge:cancelled':
        setIncoming(null)
        break

      case 'challenge:expired':
        setIncoming(null)
        setOutgoing(null)
        break

      case 'match:start':
        setIncoming(null)
        setOutgoing(null)
        setResult(null)
        setOpponentProgress(0)
        setOpponentFinished(false)
        setMatch({
          id: frame.matchId,
          distanceM: frame.distanceM,
          startsAt: frame.startsAt,
          opponent: frame.opponent,
        })
        break

      case 'match:tick':
        setOpponentProgress(frame.progressM)
        if (frame.finished) setOpponentFinished(true)
        break

      case 'match:end':
        setMatch(null)
        setPlayer(frame.player)
        setResult({
          matchId: frame.matchId,
          outcome: frame.outcome,
          reason: frame.reason,
          ratingBefore: frame.ratingBefore,
          ratingAfter: frame.ratingAfter,
          elapsedMs: frame.elapsedMs,
          opponentElapsedMs: frame.opponentElapsedMs,
          opponent: frame.opponent,
        })
        break

      default:
        break
    }
  }, [])

  useEffect(() => {
    if (!token || status !== 'ready') return
    const socket = createSocket({ token, onMessage, onStatus: setConnection })
    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = null
      setConnection('closed')
    }
  }, [token, status, onMessage])

  const send = useCallback((type, payload) => {
    return socketRef.current?.send(type, payload) ?? false
  }, [])

  /* --------------------------------------------------------------- actions */

  const signIn = useCallback((nextToken, nextPlayer) => {
    writeToken(nextToken)
    setToken(nextToken)
    setPlayer(nextPlayer)
    setStatus('ready')
  }, [])

  const signOut = useCallback(async () => {
    socketRef.current?.close()
    try {
      await api('/api/auth/logout', { method: 'POST', token })
    } catch {
      /* the local session is going away regardless */
    }
    writeToken(null)
    setToken(null)
    setPlayer(null)
    setMatch(null)
    setResult(null)
    setStatus('anonymous')
  }, [token])

  const refresh = useCallback(async () => {
    if (!token) return
    const data = await api('/api/me', { token })
    setPlayer(data.player)
    return data
  }, [token])

  const value = useMemo(
    () => ({
      token,
      player,
      meta,
      status,
      connection,
      incoming,
      outgoing,
      match,
      result,
      opponentProgress,
      opponentFinished,
      notice,
      send,
      signIn,
      signOut,
      refresh,
      setNotice,
      setOutgoing,
      setIncoming,
      clearResult: () => setResult(null),
    }),
    [
      token, player, meta, status, connection, incoming, outgoing, match,
      result, opponentProgress, opponentFinished, notice, send, signIn,
      signOut, refresh,
    ]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider')
  return ctx
}
