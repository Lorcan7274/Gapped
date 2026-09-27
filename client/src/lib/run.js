import { useSyncExternalStore } from 'react'
import { createTracker } from './tracker.js'
import { api } from './api.js'

/**
 * The run in progress — the single source of truth for it. Screens read this
 * store; they never hold run state of their own, so the same state can later
 * feed lock-screen surfaces (Live Activities, Live Updates). Phase 3 adds the
 * ghost and the gap here.
 *
 * Phases: idle → running → saving → done, or error (with the track kept for
 * a retry). A finished run's raw fixes are kept in storage until the server
 * has them, so a reload or a dead zone at the finish loses nothing.
 */

const PENDING_KEY = 'gapped.pendingRun'

const IDLE = Object.freeze({
  phase: 'idle',
  private: false,
  startedAt: null,
  metres: 0,
  elapsedMs: 0,
  paceMsPerKm: null,
  accuracy: null,
  fixes: 0,
  gps: 'waiting', // 'waiting' | 'ok' | 'blocked' | 'unavailable'
  result: null,
  error: null,
})

let state = IDLE
const listeners = new Set()
let tracker = null
let clock = null
let track = []

function set(patch) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null')
  } catch {
    return null
  }
}

function writePending(value) {
  try {
    if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    /* storage full or blocked: the upload below is the only copy */
  }
}

function stopRecording() {
  tracker?.stop()
  tracker = null
  clearInterval(clock)
  clock = null
}

async function upload(pending) {
  set({ phase: 'saving', error: null })
  try {
    const result = await api('/api/runs', { method: 'POST', body: pending })
    writePending(null)
    set({ phase: 'done', result })
    return result
  } catch (err) {
    // The server looked at it and said no: retrying cannot help.
    const refused = err.status >= 400 && err.status < 500 && !err.isUnknownPlayer
    if (refused) writePending(null)
    set({
      phase: 'error',
      error: refused ? err.message : 'Could not save the run. It is kept on this phone — try again.',
      retryable: !refused,
    })
    return null
  }
}

export const run = {
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get: () => state,

  start({ private: isPrivate = false } = {}) {
    if (state.phase === 'running' || state.phase === 'saving') return
    track = []
    const startedAt = Date.now()
    set({ ...IDLE, phase: 'running', private: isPrivate, startedAt })
    tracker = createTracker({
      onFix: (fix) => {
        track.push(fix)
        set({ gps: 'ok', fixes: track.length })
      },
      onUpdate: ({ metres, paceMsPerKm, accuracy }) => set({ metres, paceMsPerKm, accuracy }),
      onError: (err) => set({ gps: err?.code === 1 ? 'blocked' : 'unavailable' }),
    })
    tracker.start()
    clock = setInterval(() => set({ elapsedMs: Date.now() - startedAt }), 500)
  },

  /** Stop recording and hand the run to the server. */
  async finish() {
    if (state.phase !== 'running') return null
    stopRecording()
    if (track.length < 2) {
      set({ phase: 'error', error: 'Not enough GPS came through to record that run.', retryable: false })
      return null
    }
    const pending = { track, private: state.private }
    writePending(pending)
    track = []
    return upload(pending)
  },

  retry() {
    const pending = readPending()
    return pending ? upload(pending) : null
  },

  /** Back to idle. A run still waiting to upload stays in storage. */
  dismiss() {
    stopRecording()
    track = []
    set(IDLE)
  },

  /** On launch: a run that never reached the server gets another go. */
  resumePending() {
    const pending = readPending()
    if (pending && state.phase === 'idle') return upload(pending)
    return null
  },

  /** Feed a synthetic fix (debug bench and tests), through the real path. */
  push(fix) {
    tracker?.push(fix)
  },
}

export function useRun() {
  return useSyncExternalStore(run.subscribe, run.get)
}
