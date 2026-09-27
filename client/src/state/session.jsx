import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { api, readPlayer, writePlayer, readToken, writeToken } from '../lib/api.js'
import { createSocket } from '../lib/socket.js'

const SessionContext = createContext(null)

/**
 * Who is signed in, their record, and the socket for live friend duels.
 * Everything ranked — runs, and from phase 3 duels and pools — is plain HTTP
 * called from the pages that need it; this provider only keeps the player
 * current. The socket carries live duels and nothing else.
 */
export function SessionProvider({ children }) {
  const [player, setPlayer] = useState(readPlayer)
  const [status, setStatus] = useState('idle')
  const [connection, setConnection] = useState('closed')
  const [meta, setMeta] = useState(null)
  const [notice, setNotice] = useState(null)

  // Live friend duel state, as the socket reports it.
  const [incoming, setIncoming] = useState(null)
  const [outgoing, setOutgoing] = useState(null)
  const [match, setMatch] = useState(null)
  const [result, setResult] = useState(null)
  const [opponentProgress, setOpponentProgress] = useState(0)
  const [opponentFinished, setOpponentFinished] = useState(false)

  const socketRef = useRef(null)
  const [token, setToken] = useState(readToken)
  const playerId = player?.id ?? null

  // The socket callback is stable across renders, so it reads live-duel state
  // through refs rather than closing over stale values.
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

  /** Keep the signed-in player's record current, here and in storage. */
  const updatePlayer = useCallback((next) => {
    if (!next) return
    setPlayer(next)
    writePlayer(next)
  }, [])

  // Revalidate the stored session on boot. A 404 means it is dead (expired,
  // signed out elsewhere, or the database was reset) so we clear it rather
  // than hang on it.
  const forget = useCallback(() => {
    writePlayer(null)
    writeToken(null)
    setToken(null)
    setPlayer(null)
    setStatus('signed-out')
  }, [])

  useEffect(() => {
    // A stored player without a token is from before sign-in was the only
    // way in; the id alone opens nothing, so start over at sign-in.
    if (!playerId || !token) {
      forget()
      return
    }
    let cancelled = false
    setStatus('loading')
    api('/api/me')
      .then((data) => {
        if (cancelled) return
        updatePlayer(data.player)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err.isUnknownPlayer) forget()
        // A network blip should not sign you out — keep the stored player.
        else setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [playerId, token, forget, updatePlayer])

  /** Re-read the player, e.g. after coming back to the app. */
  const refreshPlayer = useCallback(async () => {
    try {
      updatePlayer((await api('/api/me')).player)
    } catch (err) {
      if (err.isUnknownPlayer) forget()
    }
  }, [updatePlayer, forget])

  /* ----------------------------------------------------------------- socket */

  const onMessage = useCallback((frame) => {
    switch (frame.type) {
      case 'ready': {
        // Reconcile with the server's view of any live duel: restore the
        // duel screen after a reload, and never leave this phone stuck on a
        // duel that ended while it was away.
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
              // GPS trail at zero, so the duel screen resumes from here.
              resumeProgressM: live.opponent
                ? Object.entries(live.progress ?? {}).find(([id]) => id !== live.opponent.id)?.[1] ?? 0
                : 0,
            })
          }
        } else if (current) {
          setMatch(null)
          setNotice({ tone: 'bad', text: 'That duel ended while you were offline.' })
        }
        break
      }
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
        setResult({
          matchId: frame.matchId, outcome: frame.outcome, reason: frame.reason,
          mode: frame.mode, distanceM: frame.distanceM, durationMs: frame.durationMs,
          elapsedMs: frame.elapsedMs, opponentElapsedMs: frame.opponentElapsedMs,
          progressM: frame.progressM, opponentProgressM: frame.opponentProgressM,
          opponent: frame.opponent,
        })
        break
      default:
        break
    }
  }, [])

  useEffect(() => {
    if (!token || status !== 'ready') return
    const socket = createSocket({
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
  }, [token, status, onMessage, forget])

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
    setToken(nextToken)
    updatePlayer(nextPlayer)
    setStatus('ready')
    return nextPlayer
  }, [updatePlayer])

  /** Step one of sign-in: have a code texted to a number. */
  const requestPhoneCode = useCallback(
    (phone) => api('/api/auth/request-code', { method: 'POST', body: { phone } }),
    []
  )

  /**
   * Step two: the code proves the number and signs into the account linked
   * to it, or creates one — which needs a display name.
   */
  const verifyPhone = useCallback(async ({ phone, code, displayName }) => {
    const res = await api('/api/auth/verify', {
      method: 'POST',
      body: { phone, code, displayName: displayName ?? null },
    })
    return adopt(res.token, res.player)
  }, [adopt])

  /** Change the display name. Throws the server's message if it is refused. */
  const rename = useCallback(async (displayName) => {
    if (!playerId) return null
    const { player: updated } = await api('/api/me/name', {
      method: 'PATCH', body: { displayName },
    })
    updatePlayer(updated)
    return updated
  }, [playerId, updatePlayer])

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
    player, meta, status, connection, notice,
    incoming, outgoing, match, result, opponentProgress, opponentFinished,
    requestPhoneCode, verifyPhone, leave, rename, send, updatePlayer, refreshPlayer,
    setNotice, setOutgoing, setIncoming,
    clearResult: () => setResult(null),
  }), [
    player, meta, status, connection, notice, incoming, outgoing,
    match, result, opponentProgress, opponentFinished,
    requestPhoneCode, verifyPhone, leave, rename, send, updatePlayer, refreshPlayer,
  ])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider')
  return ctx
}
