import { WebSocketServer } from 'ws'
import { CLIENT, SERVER, encode, decode } from './protocol.js'
import { getPlayer, touchPlayer } from '../db/players.js'
import {
  createChallenge,
  getChallenge,
  resolveChallenge,
  expireChallenges,
  hasLiveMatch,
  createMatch,
  getMatch,
  getLiveMatchFor,
  recordProgress,
  recordElapsed,
  settleMatch,
  abandon,
} from '../db/liveDuels.js'
import { publicPlayer } from '../lib/serialize.js'
import { normaliseDistance, normaliseDuration } from '../lib/validate.js'
import { db } from '../db/index.js'
import { playerIdForToken } from '../auth/index.js'

// Both runners get a shared countdown so neither starts early.
const COUNTDOWN_MS = 5_000
// If you drop mid-race we hold your place this long before you forfeit.
const DISCONNECT_GRACE_MS = 45_000
// Floor on how often we relay a runner's position to their opponent.
const TICK_MIN_INTERVAL_MS = 400
// A timed duel settles this long after its clock runs out, so the final
// progress report each phone sends at zero has time to arrive.
const TIMED_SETTLE_GRACE_MS = 3_000
// Nobody covers ground faster than the GPS filter allows; anything past this
// in a timed duel is a made-up number.
const MAX_PLAUSIBLE_SPEED_MPS = 12
export function createHub(log) {
  /** playerId -> Set<WebSocket> — a player may have the app open twice. */
  const sockets = new Map()
  /** matchId -> { forfeitTimers: Map<playerId, Timeout>, deadlineTimer } */
  const liveMatches = new Map()

  const wss = new WebSocketServer({ noServer: true })

  /* ------------------------------------------------------------- plumbing */

  function send(socket, type, payload) {
    if (socket.readyState === socket.OPEN) socket.send(encode(type, payload))
  }

  function sendTo(playerId, type, payload) {
    const set = sockets.get(playerId)
    if (!set) return false
    let delivered = false
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) {
        socket.send(encode(type, payload))
        delivered = true
      }
    }
    return delivered
  }

  const isOnline = (playerId) => {
    const set = sockets.get(playerId)
    if (!set) return false
    for (const socket of set) if (socket.readyState === socket.OPEN) return true
    return false
  }

  function register(playerId, socket) {
    if (!sockets.has(playerId)) sockets.set(playerId, new Set())
    sockets.get(playerId).add(socket)
  }

  function unregister(playerId, socket) {
    const set = sockets.get(playerId)
    if (!set) return
    set.delete(socket)
    if (set.size === 0) sockets.delete(playerId)
  }

  const fail = (socket, message, requestId) =>
    send(socket, SERVER.ERROR, { message, id: requestId ?? null })

  /* -------------------------------------------------------------- matches */

  function sideOf(match, playerId) {
    if (match.a_id === playerId) return 'a'
    if (match.b_id === playerId) return 'b'
    return null
  }

  function opponentOf(match, playerId) {
    return match.a_id === playerId ? match.b_id : match.a_id
  }

  /**
   * The live match from one player's perspective, sent in READY so a phone
   * that reloads or reconnects mid-duel can put the battle screen back up
   * instead of stranding its runner outside a race the server still holds.
   */
  function matchState(match, playerId) {
    return {
      matchId: match.id,
      mode: match.mode ?? 'race',
      distanceM: match.mode === 'timed' ? null : match.distance_m,
      durationMs: match.duration_ms ?? null,
      status: match.status,
      startedAt: match.started_at,
      startsAt: match.started_at + COUNTDOWN_MS,
      opponent: publicPlayer(getPlayer(opponentOf(match, playerId))),
      progress: { [match.a_id]: match.a_progress_m, [match.b_id]: match.b_progress_m },
    }
  }

  /** Create and announce a live duel from an accepted challenge. */
  function beginMatch({ challengeId = null, aId, bId, mode = 'race', distanceM = 0, durationMs = null }) {
    const a = getPlayer(aId)
    const b = getPlayer(bId)
    if (!a || !b) return null

    const match = createMatch({
      challengeId,
      aId: a.id,
      bId: b.id,
      mode,
      distanceM,
      durationMs,
    })

    const runtime = { forfeitTimers: new Map(), deadlineTimer: null }
    liveMatches.set(match.id, runtime)

    // A timed duel ends itself: when the clock runs out, whoever covered
    // more ground wins. Races have a finish line instead.
    if (match.mode === 'timed' && match.duration_ms) {
      runtime.deadlineTimer = setTimeout(
        () => settleByTime(match.id),
        COUNTDOWN_MS + match.duration_ms + TIMED_SETTLE_GRACE_MS
      )
    }

    const startsAt = Date.now() + COUNTDOWN_MS
    for (const [self, other] of [
      [a, b],
      [b, a],
    ]) {
      sendTo(self.id, SERVER.MATCH_START, {
        matchId: match.id,
        mode: match.mode,
        distanceM: match.mode === 'timed' ? null : match.distance_m,
        durationMs: match.duration_ms ?? null,
        startsAt,
        countdownMs: COUNTDOWN_MS,
        you: publicPlayer(self),
        opponent: publicPlayer(other),
      })
    }

    log.info(
      { matchId: match.id, mode: match.mode, a: a.display_name, b: b.display_name },
      'match started'
    )
    return match
  }

  function startMatch(challenge) {
    return beginMatch({
      challengeId: challenge.id,
      aId: challenge.from_id,
      bId: challenge.to_id,
      mode: challenge.mode ?? 'race',
      distanceM: challenge.distance_m,
      durationMs: challenge.duration_ms ?? null,
    })
  }

  /** Time is up on a timed duel: more metres wins, equal metres is a draw. */
  function settleByTime(matchId) {
    const match = getMatch(matchId)
    if (!match || match.status !== 'live') return
    recordElapsed(match.id, 'a', match.duration_ms)
    recordElapsed(match.id, 'b', match.duration_ms)
    const winnerId =
      match.a_progress_m > match.b_progress_m ? match.a_id
      : match.b_progress_m > match.a_progress_m ? match.b_id
      : null
    endMatch(matchId, winnerId, 'time')
  }

  function endMatch(matchId, winnerId, reason) {
    const settled = settleMatch(matchId, winnerId)
    if (!settled) return null

    const runtime = liveMatches.get(matchId)
    if (runtime) {
      for (const timer of runtime.forfeitTimers.values()) clearTimeout(timer)
      if (runtime.deadlineTimer) clearTimeout(runtime.deadlineTimer)
      liveMatches.delete(matchId)
    }

    // Live duels are for pride (and wagered Fuel, later): no points, no rating.
    const { match } = settled
    for (const playerId of [match.a_id, match.b_id]) {
      const other = getPlayer(opponentOf(match, playerId))
      const side = sideOf(match, playerId)
      sendTo(playerId, SERVER.MATCH_END, {
        matchId: match.id,
        mode: match.mode ?? 'race',
        distanceM: match.mode === 'timed' ? null : match.distance_m,
        durationMs: match.duration_ms ?? null,
        reason,
        winnerId: match.winner_id,
        outcome:
          match.winner_id == null ? 'draw' : match.winner_id === playerId ? 'win' : 'loss',
        elapsedMs: side === 'a' ? match.a_elapsed_ms : match.b_elapsed_ms,
        opponentElapsedMs: side === 'a' ? match.b_elapsed_ms : match.a_elapsed_ms,
        progressM: side === 'a' ? match.a_progress_m : match.b_progress_m,
        opponentProgressM: side === 'a' ? match.b_progress_m : match.a_progress_m,
        opponent: publicPlayer(other),
      })
    }

    log.info({ matchId, winnerId, reason }, 'match settled')
    return match
  }

  // A runner who vanishes mid-race forfeits once the grace period lapses.
  function armForfeit(match, playerId) {
    const runtime = liveMatches.get(match.id)
    if (!runtime || runtime.forfeitTimers.has(playerId)) return
    const timer = setTimeout(() => {
      const current = getMatch(match.id)
      if (!current || current.status !== 'live') return
      if (isOnline(playerId)) return
      endMatch(match.id, opponentOf(current, playerId), 'opponent_disconnected')
    }, DISCONNECT_GRACE_MS)
    runtime.forfeitTimers.set(playerId, timer)
  }

  function disarmForfeit(matchId, playerId) {
    const runtime = liveMatches.get(matchId)
    const timer = runtime?.forfeitTimers.get(playerId)
    if (timer) {
      clearTimeout(timer)
      runtime.forfeitTimers.delete(playerId)
    }
  }

  /* ------------------------------------------------------------- handlers */

  const handlers = {
    [CLIENT.PING](ctx) {
      touchPlayer(ctx.playerId)
      send(ctx.socket, SERVER.PONG, { id: ctx.msg.id ?? null })
    },

    [CLIENT.CHALLENGE](ctx) {
      const { socket, playerId, msg } = ctx
      const opponentId = String(msg.opponentId ?? '')

      // Two shapes of duel: a race to a distance, or most metres in a time.
      const mode = msg.mode === 'timed' ? 'timed' : 'race'
      const distanceM = mode === 'race' ? normaliseDistance(msg.distanceM) : null
      const durationMs = mode === 'timed' ? normaliseDuration(msg.durationMs) : null

      if (mode === 'race' && !distanceM) {
        return fail(socket, 'Pick a valid race distance.', msg.id)
      }
      if (mode === 'timed' && !durationMs) {
        return fail(socket, 'Pick a valid duel length.', msg.id)
      }
      if (opponentId === playerId) return fail(socket, 'You cannot race yourself.', msg.id)

      const me = getPlayer(playerId)
      const them = getPlayer(opponentId)
      if (!them) return fail(socket, 'That runner is not around.', msg.id)
      if (!isOnline(opponentId)) return fail(socket, 'That runner is offline.', msg.id)
      if (hasLiveMatch(playerId)) return fail(socket, 'You are already in a race.', msg.id)
      if (hasLiveMatch(opponentId)) return fail(socket, 'They are already racing.', msg.id)
      // Phase 5 limits live challenges to accepted friends. There is no
      // geography anywhere: friends race wherever they each are.

      const challenge = createChallenge({
        fromId: playerId, toId: opponentId, mode, distanceM, durationMs,
      })

      send(socket, SERVER.CHALLENGE_SENT, {
        id: msg.id ?? null,
        challengeId: challenge.id,
        opponent: publicPlayer(them),
        mode,
        distanceM,
        durationMs,
        expiresAt: challenge.expires_at,
      })
      sendTo(opponentId, SERVER.CHALLENGE_INCOMING, {
        challengeId: challenge.id,
        from: publicPlayer(me),
        mode,
        distanceM,
        durationMs,
        expiresAt: challenge.expires_at,
      })
    },

    [CLIENT.CHALLENGE_CANCEL](ctx) {
      const challenge = getChallenge(String(ctx.msg.challengeId ?? ''))
      if (!challenge || challenge.from_id !== ctx.playerId) return
      if (!resolveChallenge(challenge.id, 'cancelled')) return
      sendTo(challenge.to_id, SERVER.CHALLENGE_CANCELLED, { challengeId: challenge.id })
    },

    [CLIENT.CHALLENGE_RESPOND](ctx) {
      const { socket, playerId, msg } = ctx
      const challenge = getChallenge(String(msg.challengeId ?? ''))
      if (!challenge || challenge.to_id !== playerId) {
        return fail(socket, 'No such challenge.', msg.id)
      }
      if (challenge.status !== 'pending' || challenge.expires_at < Date.now()) {
        resolveChallenge(challenge.id, 'expired')
        return send(socket, SERVER.CHALLENGE_EXPIRED, { challengeId: challenge.id })
      }

      if (!msg.accept) {
        if (resolveChallenge(challenge.id, 'declined')) {
          sendTo(challenge.from_id, SERVER.CHALLENGE_DECLINED, {
            challengeId: challenge.id,
            by: publicPlayer(getPlayer(playerId)),
          })
        }
        return
      }

      if (hasLiveMatch(playerId) || hasLiveMatch(challenge.from_id)) {
        return fail(socket, 'One of you is already racing.', msg.id)
      }
      if (!isOnline(challenge.from_id)) {
        resolveChallenge(challenge.id, 'expired')
        return fail(socket, 'They went offline.', msg.id)
      }
      // Only the caller that flips the row out of `pending` starts the match.
      if (!resolveChallenge(challenge.id, 'accepted')) return

      startMatch(challenge)
    },

    [CLIENT.MATCH_PROGRESS](ctx) {
      const { socket, playerId, msg } = ctx
      const match = getMatch(String(msg.matchId ?? ''))
      if (!match || match.status !== 'live') return
      const side = sideOf(match, playerId)
      if (!side) return

      const metres = Number(msg.progressM)
      if (!Number.isFinite(metres) || metres < 0) return
      // Progress only ever moves forward. A race also never moves past its
      // finish line; a timed duel is capped at the fastest plausible run.
      const cap = match.mode === 'timed'
        ? Math.ceil((match.duration_ms / 1000) * MAX_PLAUSIBLE_SPEED_MPS)
        : match.distance_m
      const previous = side === 'a' ? match.a_progress_m : match.b_progress_m
      const clamped = Math.min(cap, Math.max(previous, metres))

      recordProgress(match.id, side, clamped)

      const throttleKey = `${match.id}:${playerId}`
      const last = socket.lastTick?.get(throttleKey) ?? 0
      const nowMs = Date.now()
      if (nowMs - last < TICK_MIN_INTERVAL_MS) return
      socket.lastTick ??= new Map()
      socket.lastTick.set(throttleKey, nowMs)

      sendTo(opponentOf(match, playerId), SERVER.MATCH_TICK, {
        matchId: match.id,
        playerId,
        progressM: clamped,
        elapsedMs: Number(msg.elapsedMs) || null,
        remainingM: match.mode === 'timed' ? null : Math.max(0, match.distance_m - clamped),
      })
    },

    [CLIENT.MATCH_FINISH](ctx) {
      const { socket, playerId, msg } = ctx
      const match = getMatch(String(msg.matchId ?? ''))
      if (!match || match.status !== 'live') return
      // A timed duel has no finish line; it ends when the clock does.
      if (match.mode === 'timed') return
      const side = sideOf(match, playerId)
      if (!side) return

      const elapsedMs = Number(msg.elapsedMs)
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
        return fail(socket, 'A finish needs an elapsed time.', msg.id)
      }

      recordProgress(match.id, side, match.distance_m)
      recordElapsed(match.id, side, Math.round(elapsedMs))

      sendTo(opponentOf(match, playerId), SERVER.MATCH_TICK, {
        matchId: match.id,
        playerId,
        progressM: match.distance_m,
        elapsedMs: Math.round(elapsedMs),
        remainingM: 0,
        finished: true,
      })

      // First across the line takes it. The opponent's own finish, if it
      // arrives later, hits the `status !== 'live'` guard above.
      endMatch(match.id, playerId, 'finished')
    },

    [CLIENT.MATCH_FORFEIT](ctx) {
      const match = getMatch(String(ctx.msg.matchId ?? ''))
      if (!match || match.status !== 'live') return
      if (!sideOf(match, ctx.playerId)) return
      endMatch(match.id, opponentOf(match, ctx.playerId), 'forfeit')
    },

  }

  /* ------------------------------------------------------------ lifecycle */

  wss.on('connection', (socket, request, player) => {
    const playerId = player.id
    socket.isAlive = true
    socket.lastTick = new Map()
    register(playerId, socket)
    touchPlayer(playerId)

    const live = getLiveMatchFor(playerId)
    if (live) disarmForfeit(live.id, playerId)

    send(socket, SERVER.READY, {
      liveMatch: live ? matchState(live, playerId) : null,
    })

    socket.on('pong', () => {
      socket.isAlive = true
    })

    socket.on('message', (raw) => {
      const msg = decode(raw)
      if (!msg) return fail(socket, 'Malformed frame.')
      const handler = handlers[msg.type]
      if (!handler) return fail(socket, `Unknown message type: ${msg.type}`, msg.id)
      try {
        handler({ socket, playerId, msg })
      } catch (error) {
        log.error({ error, type: msg.type, playerId }, 'ws handler failed')
        fail(socket, 'Something went wrong handling that.', msg.id)
      }
    })

    socket.on('close', () => {
      unregister(playerId, socket)
      if (isOnline(playerId)) return
      const current = getLiveMatchFor(playerId)
      if (current) armForfeit(current, playerId)
    })

    socket.on('error', (error) => log.warn({ error, playerId }, 'socket error'))
  })

  // Drop sockets that stop answering, so a vanished runner's forfeit clock starts.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate()
        continue
      }
      socket.isAlive = false
      socket.ping()
    }
  }, 30_000)
  heartbeat.unref()

  // Sweep challenges nobody answered, and tell both phones — otherwise the
  // challenger's "challenge sent" bar sits there until they cancel it.
  const sweeper = setInterval(() => {
    const expired = expireChallenges()
    for (const challenge of expired) {
      sendTo(challenge.from_id, SERVER.CHALLENGE_EXPIRED, { challengeId: challenge.id })
      sendTo(challenge.to_id, SERVER.CHALLENGE_EXPIRED, { challengeId: challenge.id })
    }
    if (expired.length > 0) log.debug({ expired: expired.length }, 'expired stale challenges')
  }, 15_000)
  sweeper.unref()

  /** Fastify hands us the raw upgrade; we authenticate before accepting. */
  function handleUpgrade(request, socket, head) {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    // The session token is the credential, as on the HTTP side. A dead one
    // (expired, signed out, player removed) is refused so the client can
    // clear it and show sign-in again.
    const player = getPlayer(playerIdForToken(url.searchParams.get('token')))

    if (!player) {
      // Complete the handshake, then close with policy code 1008. A raw 401
      // surfaces in the browser as an anonymous 1006, so the client could
      // never tell "server is down" from "this session is dead" and would
      // retry a dead credential forever.
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(1008, 'unknown player')
      })
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, player)
    })
  }

  function close() {
    clearInterval(heartbeat)
    clearInterval(sweeper)
    for (const runtime of liveMatches.values()) {
      for (const timer of runtime.forfeitTimers.values()) clearTimeout(timer)
      if (runtime.deadlineTimer) clearTimeout(runtime.deadlineTimer)
    }
    liveMatches.clear()
    for (const socket of wss.clients) socket.terminate()
    wss.close()
  }

  // Any duel still marked live at boot belongs to a process that is gone.
  // Nobody was watching it finish, so it is abandoned, not settled — it just
  // stops blocking new challenges.
  function reconcileOnBoot() {
    const stale = db.prepare("SELECT id FROM live_duels WHERE status = 'live'").all()
    for (const match of stale) {
      abandon(match.id)
      log.warn({ matchId: match.id }, 'abandoned match left live by a previous process')
    }
  }

  return { wss, handleUpgrade, close, reconcileOnBoot, isOnline, sendTo }
}
