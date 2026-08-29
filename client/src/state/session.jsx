import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { api, readPlayer, writePlayer, readToken, writeToken } from '../lib/api.js'
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
  const [token, setToken] = useState(readToken)
  const playerId = player?.id ?? null

  // The socket callback is stable across renders, so it reads the live-race
  // state through refs rather than closing over stale values.
  const matchRef = useRef(null)
  const incomingRef = useRef(null)
  const outgoingRef = useRef(null)
  useEffect(() => { matchRef.current = match }, [match])
  useEffect(() => { incomingRef.current = incoming }, [incoming])
  useEffect(() => { outgoingRef.current = outgoing }, [outgoing])

  /* -------------------------------------------------------------- bootstrap */

  useEffect(() => {
    api('/api/meta').then(setMeta).catch(() => {})
  }, [])

  // Revalidate the stored player on boot. A 404 means the id is dead (the
  // database was reset, say) so we clear it rather than hang on a dead id.
  const forget = useCallback(() => {
    writePlayer(null)
    writeToken(null)
    setToken(null)
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

  /**
   * The duel we were showing settled while this phone was offline, so the
   * match:end frame is gone for good. Rebuild the result sheet from history.
   */
  const recoverResult = useCallback(async (stale) => {
    try {
      const { matches } = await api('/api/me/matches', { playerId: readPlayer()?.id })
      const m = matches?.find((row) => row.id === stale.id)
      if (!m) {
        setNotice({ tone: 'bad', text: 'That duel ended while you were offline.' })
        return
      }
      setResult({
        matchId: m.id,
        outcome: m.winnerId == null ? 'draw' : m.winnerId === m.you.id ? 'win' : 'loss',
        reason: 'reconnected',
        mode: m.mode, distanceM: m.distanceM, durationMs: m.durationMs,
        ratingBefore: m.you.ratingBefore, ratingAfter: m.you.ratingAfter,
        elapsedMs: m.you.elapsedMs, opponentElapsedMs: m.opponent.elapsedMs,
        progressM: m.you.progressM, opponentProgressM: m.opponent.progressM,
        opponent: { id: m.opponent.id, displayName: m.opponent.displayName },
      })
    } catch {
      setNotice({ tone: 'bad', text: 'That duel ended while you were offline.' })
    }
  }, [])

  const onMessage = useCallback((frame) => {
    switch (frame.type) {
      case 'ready': {
        setPlayer((prev) => {
          const next = { ...prev, ...frame.player }
          writePlayer(next)
          return next
        })
        // Reconcile with the server's view of any live duel: restore the
        // battle screen after a reload, or fetch the missed result after a
        // drop — never leave this phone stuck on a race that is over.
        const live = frame.liveMatch
        const current = matchRef.current
        if (live && live.status === 'live') {
          if (!current || current.id !== live.matchId) {
            setResult(null)
            setOpponentFinished(false)
            setOpponentProgress(live.opponent ? live.progress?.[live.opponent.id] ?? 0 : 0)
            setMatch({
              id: live.matchId, mode: live.mode, distanceM: live.distanceM,
              durationMs: live.durationMs, startsAt: live.startsAt, opponent: live.opponent,
              // Metres the server already has for us — a reload restarts the
              // GPS trail at zero, so the battle screen resumes from here.
              resumeProgressM: live.progress?.[frame.player?.id] ?? 0,
            })
          }
        } else if (current) {
          setMatch(null)
          recoverResult(current)
        }
        break
      }
      case 'players':
        setPlayers(frame.players)
        break
      case 'error':
        setNotice({ tone: 'bad', text: frame.message })
        break
      case 'challenge:sent':
        setOutgoing({
          challengeId: frame.challengeId, opponent: frame.opponent,
          mode: frame.mode, distanceM: frame.distanceM, durationMs: frame.durationMs,
          expiresAt: frame.expiresAt,
        })
        break
      case 'challenge:incoming':
        setIncoming({
          challengeId: frame.challengeId, from: frame.from,
          mode: frame.mode, distanceM: frame.distanceM, durationMs: frame.durationMs,
          expiresAt: frame.expiresAt,
        })
        break
      case 'challenge:declined':
        setOutgoing(null)
        setNotice({ tone: 'bad', text: `${frame.by.displayName} turned it down.` })
        break
      case 'challenge:cancelled':
        setIncoming(null)
        break
      case 'challenge:expired': {
        const out = outgoingRef.current
        if (out && out.challengeId === frame.challengeId) {
          setOutgoing(null)
          setNotice({ tone: 'bad', text: `${out.opponent.displayName} did not answer.` })
        }
        const inc = incomingRef.current
        if (inc && inc.challengeId === frame.challengeId) setIncoming(null)
        break
      }
      case 'match:start':
        setIncoming(null); setOutgoing(null); setResult(null)
        setOpponentProgress(0); setOpponentFinished(false)
        setMatch({
          id: frame.matchId, mode: frame.mode, distanceM: frame.distanceM,
          durationMs: frame.durationMs, startsAt: frame.startsAt, opponent: frame.opponent,
        })
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
          mode: frame.mode, distanceM: frame.distanceM, durationMs: frame.durationMs,
          ratingBefore: frame.ratingBefore, ratingAfter: frame.ratingAfter,
          elapsedMs: frame.elapsedMs, opponentElapsedMs: frame.opponentElapsedMs,
          progressM: frame.progressM, opponentProgressM: frame.opponentProgressM,
          opponent: frame.opponent,
        })
        break
      default:
        break
    }
  }, [recoverResult])

  useEffect(() => {
    if (!playerId || status !== 'ready') return
    const socket = createSocket({
      playerId,
      token,
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
  }, [playerId, token, status, onMessage, forget])

  const send = useCallback((type, payload) => socketRef.current?.send(type, payload) ?? false, [])

  // The server sweeps unanswered challenges on its own clock; this local
  // timer covers the gap so a sent challenge never looks alive after it died.
  useEffect(() => {
    if (!outgoing?.expiresAt) return
    const opponentName = outgoing.opponent?.displayName ?? 'They'
    const timer = setTimeout(() => {
      setOutgoing(null)
      setNotice({ tone: 'bad', text: `${opponentName} did not answer.` })
    }, Math.max(0, outgoing.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [outgoing])

  /* ---------------------------------------------------------------- actions */

  const adopt = useCallback((nextToken, nextPlayer) => {
    writeToken(nextToken)
    writePlayer(nextPlayer)
    setToken(nextToken)
    setPlayer(nextPlayer)
    setStatus('ready')
    return nextPlayer
  }, [])

  /** Step one of sign-in: have a code texted to a number. */
  const requestPhoneCode = useCallback(
    (phone) => api('/api/auth/request-code', { method: 'POST', body: { phone } }),
    []
  )

  /**
   * Step two: the code proves the number and signs into whichever account
   * owns it — carrying over an anonymous player from this device if the
   * number is new.
   */
  const verifyPhone = useCallback(async ({ phone, code, displayName, coords }) => {
    const res = await api('/api/auth/verify', {
      method: 'POST',
      body: {
        phone, code,
        displayName: displayName ?? null,
        lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        claimPlayerId: readPlayer()?.id ?? null,
      },
    })
    return adopt(res.token, res.player)
  }, [adopt])

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

  const leave = useCallback(async () => {
    socketRef.current?.close()
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      /* the local session is going away regardless */
    }
    forget()
  }, [forget])

  const value = useMemo(() => ({
    player, players, meta, status, connection, notice,
    incoming, outgoing, match, result, opponentProgress, opponentFinished,
    requestPhoneCode, verifyPhone, leave, pushLocation, send,
    setNotice, setOutgoing, setIncoming,
    clearResult: () => setResult(null),
  }), [
    player, players, meta, status, connection, notice, incoming, outgoing,
    match, result, opponentProgress, opponentFinished, requestPhoneCode,
    verifyPhone, leave, pushLocation, send,
  ])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider')
  return ctx
}
