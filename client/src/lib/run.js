import { useSyncExternalStore } from 'react'
import { createTracker, MAX_ACCURACY_M } from './tracker.js'
import { api, readPlayer } from './api.js'
import { ghostMetresAt } from './ghost.js'

/**
 * The run in progress — the single source of truth for it. Screens read this
 * store; they never hold run state of their own, so the same state can later
 * feed lock-screen surfaces (Live Activities, Live Updates).
 *
 * A run is solo, or a duel leg racing a ghost. A leg is clocked from the
 * first GPS fix — exactly as the server times it — and the gap is measured
 * like for like: your distance at your latest fix against where the ghost
 * was at that same moment of its run. It ends itself at the line.
 *
 * Phases: idle → running → saving → done, or error (with the track kept for
 * a retry). A finished run's raw fixes are kept in storage until the server
 * has them, so a reload or a dead zone at the finish loses nothing. Runs
 * waiting to upload queue up, oldest first, each marked with the player who
 * ran it, so a second run never overwrites the first and a run only ever
 * uploads to its own account.
 */

const PENDING_KEY = 'gapped.pendingRun'

const IDLE = Object.freeze({
  phase: 'idle',
  mode: 'solo', // 'solo' | 'duel'
  // For a duel leg: { id, leg, opponent, distanceM, ghostTimeMs }.
  duel: null,
  // Metres ahead of the ghost (negative: behind), and where the ghost is.
  gapM: null,
  ghostM: 0,
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
let ghost = null // the ghost's profile, kept out of state (it can be large)
let firstFixAt = null
let uploading = null // the queued run the current save (or its error) is about

function set(patch) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

/** Every run still waiting to upload, oldest first. */
function readPending() {
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null')
    return Array.isArray(stored) ? stored : stored ? [stored] : []
  } catch {
    return []
  }
}

function writePending(list) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    /* storage full or blocked: the upload below is the only copy */
  }
}

// A run is known by its first fix: the server keys runs the same way.
const sameRun = (a, b) => a.track?.[0]?.t === b.track?.[0]?.t
const forget = (pending) => writePending(readPending().filter((p) => !sameRun(p, pending)))
const mine = (pending) => {
  const me = readPlayer()?.id
  return Boolean(me) && (pending.playerId ?? me) === me
}

function stopRecording() {
  tracker?.stop()
  tracker = null
  clearInterval(clock)
  clock = null
}

async function upload(pending) {
  uploading = pending
  set({ phase: 'saving', error: null })
  const { playerId: _owner, ...body } = pending
  try {
    const result = await api('/api/runs', { method: 'POST', body })
    forget(pending)
    set({ phase: 'done', result })
    return result
  } catch (err) {
    // The server looked at it and said no: retrying cannot help.
    const refused = err.status >= 400 && err.status < 500 && !err.isUnknownPlayer
    if (refused) forget(pending)
    set({
      phase: 'error',
      error: refused ? err.message : 'Could not save the run. It is kept on this phone — try again.',
      retryable: !refused,
    })
    return null
  }
}

function begin(patch) {
  track = []
  firstFixAt = null
  const startedAt = Date.now()
  set({ ...IDLE, ...patch, phase: 'running', startedAt })
  tracker = createTracker({
    onFix: (fix) => {
      // Phones can hand over the same fix twice; the server wants time order.
      if (!track.length || fix.t > track.at(-1).t) track.push(fix)
      set({ gps: 'ok', fixes: track.length })
    },
    onUpdate: (update) => {
      const { metres, paceMsPerKm, accuracy } = update
      firstFixAt = update.firstFixAt
      if (state.mode !== 'duel' || firstFixAt == null) {
        set({ metres, paceMsPerKm, accuracy })
        return
      }
      const ghostM = ghostMetresAt(ghost, update.lastFixAt - firstFixAt)
      set({ metres, paceMsPerKm, accuracy, ghostM, gapM: metres - ghostM })
      // Over the line: the leg is done.
      if (metres >= state.duel.distanceM) run.finish()
    },
    onError: (err) => set({ gps: err?.code === 1 ? 'blocked' : 'unavailable' }),
  })
  tracker.start()
  // A leg's clock waits for the first fix; a solo run's starts at the tap.
  clock = setInterval(() => {
    const from = state.mode === 'duel' ? firstFixAt : startedAt
    set({ elapsedMs: from == null ? 0 : Date.now() - from })
  }, 500)
}

export const run = {
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get: () => state,

  start({ private: isPrivate = false } = {}) {
    if (state.phase === 'running' || state.phase === 'saving') return
    begin({ private: isPrivate })
  },

  /**
   * Race a ghost: leg one of a challenge, or the reply. `duel` is the
   * server's duel, `profile` the ghost to race, `leg` 1 or 2.
   */
  startLeg({ duel, profile, timeMs, distanceM, leg }) {
    if (state.phase === 'running' || state.phase === 'saving') return
    ghost = profile
    begin({
      mode: 'duel',
      duel: {
        id: duel.id,
        leg,
        opponent: duel.opponent,
        distanceM,
        ghostTimeMs: timeMs,
      },
      gapM: 0,
    })
  },

  /**
   * Stop recording and hand the run to the server. `quit` ends a duel leg
   * before the line — it counts as losing by the expected margin.
   */
  async finish({ quit = false } = {}) {
    if (state.phase !== 'running') return null
    // Leave 'running' first: stopping the tracker emits one last update,
    // which must not finish the run a second time.
    set({ phase: 'saving' })
    stopRecording()
    ghost = null
    if (track.length < 2) {
      set({ phase: 'error', error: 'Not enough GPS came through to record that run.', retryable: false })
      return null
    }
    const pending = { track, private: state.private, playerId: readPlayer()?.id ?? null }
    if (state.duel) Object.assign(pending, { duelId: state.duel.id, quit })
    writePending([...readPending(), pending])
    track = []
    return upload(pending)
  },

  retry() {
    return uploading ? upload(uploading) : null
  },

  /**
   * Back to idle. A run still waiting to upload stays in storage; after a
   * saved run, the next one queued behind it (if any) goes up.
   */
  dismiss() {
    const saved = state.phase === 'done'
    stopRecording()
    track = []
    ghost = null
    uploading = null
    set(IDLE)
    if (saved) run.resumePending()
  },

  /** On launch: the oldest run of yours that never reached the server gets another go. */
  resumePending() {
    if (state.phase !== 'idle') return null
    const next = readPending().find(mine)
    return next ? upload(next) : null
  },

  /** Where this run has been, for the map: fixes good enough to draw, oldest first. */
  path() {
    return track.filter((f) => f.acc == null || f.acc <= MAX_ACCURACY_M)
  },

  /** Feed a synthetic fix (debug bench and tests), through the real path. */
  push(fix) {
    tracker?.push(fix)
  },
}

export function useRun() {
  return useSyncExternalStore(run.subscribe, run.get)
}
