import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { api, readPlayer, writePlayer, readToken, writeToken } from '../lib/api.js'
import { createSocket } from '../lib/socket.js'
import { createCall, getCallMedia } from '../lib/call.js'

const SessionContext = createContext(null)

// An unanswered call stops ringing after this long.
const CALL_RING_MS = 30_000

const stopTracks = (stream) => stream?.getTracks().forEach((track) => track.stop())

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
  /** Quick-match search: the format key we are queued for, or null. */
  const [queued, setQueued] = useState(null)
  const [match, setMatch] = useState(null)
  const [result, setResult] = useState(null)
  const [opponentProgress, setOpponentProgress] = useState(0)
  const [opponentFinished, setOpponentFinished] = useState(false)
  /**
   * The in-duel video call: null, or
   * { status: 'outgoing' | 'incoming' | 'connecting' | 'live', from, hasCamera,
   *   camera, muted, remoteCamera, remoteStream }.
   */
  const [call, setCall] = useState(null)

  const socketRef = useRef(null)
  /** The RTCPeerConnection wrapper and our camera/mic, owned outside React state. */
  const rtcRef = useRef(null)
  const localStreamRef = useRef(null)
  const [token, setToken] = useState(readToken)
  const playerId = player?.id ?? null

  // The socket callback is stable across renders, so it reads the live-race
  // state through refs rather than closing over stale values.
  const matchRef = useRef(null)
  const incomingRef = useRef(null)
  const outgoingRef = useRef(null)
  const queuedRef = useRef(null)
  const callRef = useRef(null)
  useEffect(() => { callRef.current = call }, [call])
  useEffect(() => { matchRef.current = match }, [match])
  useEffect(() => { incomingRef.current = incoming }, [incoming])
  useEffect(() => { outgoingRef.current = outgoing }, [outgoing])
  useEffect(() => { queuedRef.current = queued }, [queued])

  /* -------------------------------------------------------------- bootstrap */

  useEffect(() => {
    api('/api/meta').then(setMeta).catch(() => {})
  }, [])

  // Revalidate the stored session on boot. A 404 means it is dead (expired,
  // signed out elsewhere, or the database was reset) so we clear it rather
  // than hang on it.
  const forget = useCallback(() => {
    writePlayer(null)
    writeToken(null)
    setToken(null)
    setPlayer(null)
    setPlayers([])
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
  }, [playerId, token, forget])

  /* ----------------------------------------------------------------- socket */

  /**
   * The duel we were showing settled while this phone was offline, so the
   * match:end frame is gone for good. Rebuild the result sheet from history.
   */
  const recoverResult = useCallback(async (stale) => {
    try {
      const { matches } = await api('/api/me/matches')
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

  /** Hang up locally: close the connection and switch the camera light off. */
  const teardownCall = useCallback(() => {
    rtcRef.current?.stop()
    rtcRef.current = null
    stopTracks(localStreamRef.current)
    localStreamRef.current = null
    setCall(null)
  }, [])

  const openCall = useCallback((m, stream, polite) => {
    const signal = (payload) => socketRef.current?.send('call:signal', { matchId: m.id, ...payload })
    rtcRef.current = createCall({
      iceServers: m.iceServers,
      polite,
      localStream: stream,
      sendSignal: signal,
      onRemoteStream: (remoteStream) => setCall((c) => c && { ...c, remoteStream }),
      onState: (state) => {
        if (state === 'connected') setCall((c) => c && { ...c, status: 'live' })
        if (state === 'failed') {
          socketRef.current?.send('call:end', { matchId: m.id })
          teardownCall()
          setNotice({ tone: 'bad', text: 'The call could not connect.' })
        }
      },
    })
    signal({ camera: stream.getVideoTracks().length > 0 })
  }, [teardownCall])

  const onMessage = useCallback((frame) => {
    // Call frames for a duel this phone is no longer showing are stale.
    if (frame.type.startsWith('call:') && frame.matchId !== matchRef.current?.id) return

    switch (frame.type) {
      case 'ready': {
        // The server drops a call when our socket does, so ours is over too.
        if (callRef.current) teardownCall()
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
              iceServers: live.iceServers,
              // Metres the server already has for us — a reload restarts the
              // GPS trail at zero, so the battle screen resumes from here.
              resumeProgressM: live.progress?.[frame.player?.id] ?? 0,
            })
          }
        } else if (current) {
          setMatch(null)
          recoverResult(current)
        }
        // A search does not survive our socket dropping server-side, so a
        // reconnecting phone that was still searching quietly rejoins.
        if (queuedRef.current && !(live && live.status === 'live')) {
          socketRef.current?.send('queue:join', { format: queuedRef.current })
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
      case 'queue:joined':
        setQueued(frame.format)
        break
      case 'queue:left':
        setQueued(null)
        break
      case 'match:start':
        setIncoming(null); setOutgoing(null); setResult(null); setQueued(null)
        setOpponentProgress(0); setOpponentFinished(false)
        setMatch({
          id: frame.matchId, mode: frame.mode, distanceM: frame.distanceM,
          durationMs: frame.durationMs, startsAt: frame.startsAt, opponent: frame.opponent,
          iceServers: frame.iceServers,
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
      case 'call:incoming':
        // Crossed calls: ours lost the race, so let go of the media held for it.
        stopTracks(localStreamRef.current)
        localStreamRef.current = null
        setCall({
          status: 'incoming', from: frame.from, hasCamera: false,
          camera: false, muted: false, remoteCamera: true, remoteStream: null,
        })
        break
      case 'call:accepted': {
        const stream = localStreamRef.current
        if (callRef.current?.status !== 'outgoing' || !stream) {
          socketRef.current?.send('call:end', { matchId: frame.matchId })
          break
        }
        setCall((c) => c && { ...c, status: 'connecting' })
        openCall(matchRef.current, stream, false)
        break
      }
      case 'call:signal':
        if (typeof frame.camera === 'boolean') {
          setCall((c) => c && { ...c, remoteCamera: frame.camera })
        }
        if (frame.description || frame.candidate) rtcRef.current?.handleSignal(frame)
        break
      case 'call:declined':
        teardownCall()
        setNotice({ tone: 'bad', text: `${frame.by?.displayName ?? 'They'} declined the call.` })
        break
      case 'call:ended': {
        const was = callRef.current
        teardownCall()
        const text = {
          hangup: was?.status === 'incoming' ? 'Missed call.' : 'Call ended.',
          disconnected: 'Call dropped.',
          unavailable: 'They cannot take a call right now.',
        }[frame.reason]
        if (was && text) setNotice({ tone: 'bad', text })
        break
      }
      default:
        break
    }
  }, [recoverResult, teardownCall, openCall])

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

  // A call belongs to one duel. Whenever the duel changes or ends, hang up.
  useEffect(() => teardownCall, [match?.id, teardownCall])

  /* ---------------------------------------------------------------- actions */

  /** Ring the opponent. Asks for camera and mic first, on the tap. */
  const startCall = useCallback(async () => {
    const m = matchRef.current
    if (!m || callRef.current) return
    setCall({
      status: 'outgoing', from: null, hasCamera: false,
      camera: false, muted: false, remoteCamera: true, remoteStream: null,
    })
    let stream
    try {
      stream = await getCallMedia()
    } catch {
      setCall(null)
      setNotice({ tone: 'bad', text: 'Allow the microphone to call.' })
      return
    }
    // Cancelled, crossed or the duel ended while the permission prompt was up.
    if (callRef.current?.status !== 'outgoing' || matchRef.current?.id !== m.id) {
      stopTracks(stream)
      return
    }
    localStreamRef.current = stream
    const hasCamera = stream.getVideoTracks().length > 0
    setCall((c) => c && { ...c, hasCamera, camera: hasCamera })
    send('call:invite', { matchId: m.id })
  }, [send])

  const acceptCall = useCallback(async () => {
    const m = matchRef.current
    if (!m || callRef.current?.status !== 'incoming') return
    setCall((c) => c && { ...c, status: 'connecting' })
    let stream
    try {
      stream = await getCallMedia()
    } catch {
      send('call:decline', { matchId: m.id })
      setCall(null)
      setNotice({ tone: 'bad', text: 'Allow the microphone to answer.' })
      return
    }
    if (callRef.current?.status !== 'connecting' || matchRef.current?.id !== m.id) {
      stopTracks(stream)
      return
    }
    localStreamRef.current = stream
    const hasCamera = stream.getVideoTracks().length > 0
    setCall((c) => c && { ...c, hasCamera, camera: hasCamera })
    // Accept before signalling: the server relays nothing until it has.
    send('call:accept', { matchId: m.id })
    openCall(m, stream, true)
  }, [send, openCall])

  const declineCall = useCallback(() => {
    const m = matchRef.current
    if (m) send('call:decline', { matchId: m.id })
    setCall(null)
  }, [send])

  const endCall = useCallback(() => {
    const m = matchRef.current
    if (m) send('call:end', { matchId: m.id })
    teardownCall()
  }, [send, teardownCall])

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    const m = matchRef.current
    if (!track || !m) return
    track.enabled = !track.enabled
    setCall((c) => c && { ...c, camera: track.enabled })
    send('call:signal', { matchId: m.id, camera: track.enabled })
  }, [send])

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? []
    const muted = !callRef.current?.muted
    for (const track of tracks) track.enabled = !muted
    setCall((c) => c && { ...c, muted })
  }, [])

  useEffect(() => {
    if (call?.status !== 'outgoing') return
    const timer = setTimeout(() => {
      endCall()
      setNotice({ tone: 'bad', text: 'No answer.' })
    }, CALL_RING_MS)
    return () => clearTimeout(timer)
  }, [call?.status, endCall])

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

  /** Push a position. Silently does nothing useful if location was denied. */
  const pushLocation = useCallback(async (coords) => {
    if (!playerId || !coords) return null
    const { player: updated } = await api('/api/location', {
      method: 'POST', body: coords,
    })
    setPlayer(updated)
    writePlayer(updated)
    send('location', coords)
    return updated
  }, [playerId, send])

  /** Change the display name. Throws the server's message if it is refused. */
  const rename = useCallback(async (displayName) => {
    if (!playerId) return null
    const { player: updated } = await api('/api/me/name', {
      method: 'PATCH', body: { displayName },
    })
    setPlayer(updated)
    writePlayer(updated)
    return updated
  }, [playerId])

  /** Quick match: queue for a fixed format; the server pairs and starts. */
  const joinQueue = useCallback((format) => send('queue:join', { format }), [send])

  const leaveQueue = useCallback(() => {
    // Cleared locally first, so a reconnect cannot quietly rejoin a search
    // the runner already cancelled.
    setQueued(null)
    send('queue:leave')
  }, [send])

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
    queued, joinQueue, leaveQueue,
    call, startCall, acceptCall, declineCall, endCall, toggleCamera, toggleMute,
    requestPhoneCode, verifyPhone, leave, pushLocation, rename, send,
    setNotice, setOutgoing, setIncoming,
    clearResult: () => setResult(null),
  }), [
    player, players, meta, status, connection, notice, incoming, outgoing,
    match, result, opponentProgress, opponentFinished, queued, joinQueue,
    leaveQueue, call, startCall, acceptCall, declineCall, endCall, toggleCamera,
    toggleMute, requestPhoneCode, verifyPhone, leave, pushLocation, rename, send,
  ])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider')
  return ctx
}
