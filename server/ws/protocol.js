// Every frame is JSON: { type, ...payload }. `id` echoes a client request id
// back on the reply so the UI can correlate.

export const CLIENT = {
  PING: 'ping',
  LOCATION: 'location',
  CHALLENGE: 'challenge',
  CHALLENGE_CANCEL: 'challenge:cancel',
  CHALLENGE_RESPOND: 'challenge:respond',
  MATCH_PROGRESS: 'match:progress',
  MATCH_FINISH: 'match:finish',
  MATCH_FORFEIT: 'match:forfeit',
}

export const SERVER = {
  READY: 'ready',
  PONG: 'pong',
  ERROR: 'error',
  CHALLENGE_SENT: 'challenge:sent',
  CHALLENGE_INCOMING: 'challenge:incoming',
  CHALLENGE_DECLINED: 'challenge:declined',
  CHALLENGE_CANCELLED: 'challenge:cancelled',
  CHALLENGE_EXPIRED: 'challenge:expired',
  MATCH_START: 'match:start',
  MATCH_TICK: 'match:tick',
  MATCH_END: 'match:end',
  PRESENCE: 'presence',
  PLAYERS: 'players',
}

export function encode(type, payload = {}) {
  return JSON.stringify({ type, ts: Date.now(), ...payload })
}

export function decode(raw) {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.type === 'string' ? parsed : null
  } catch {
    return null
  }
}
