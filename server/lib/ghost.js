import { DUEL } from '../config/game.js'

/**
 * Ghosts: a run replayed as distance over time. A profile is the list of
 * [ms since the first accepted fix, cumulative metres] that lib/track.js
 * walkTrack produces — no coordinates, so racing someone's ghost never
 * reveals where they ran. Pure.
 */

/** Rounded for the wire and storage: whole milliseconds, decimetres. */
export const compactProfile = (profile) =>
  profile.map(([t, m]) => [Math.round(t), Math.round(m * 10) / 10])

/**
 * When the runner covered `distanceM`, in ms from their first accepted fix,
 * interpolated between fixes. A track that stops within the finish tolerance
 * short of the line is extrapolated at its closing pace. Null if the runner
 * never got there — a leg that stops short is a quit.
 */
export function timeToCover(profile, distanceM, cfg = DUEL) {
  if (!Array.isArray(profile) || profile.length === 0 || !(distanceM > 0)) return null
  for (let i = 1; i < profile.length; i++) {
    const [t1, m1] = profile[i]
    if (m1 >= distanceM) {
      const [t0, m0] = profile[i - 1]
      return m1 === m0 ? t1 : t0 + ((distanceM - m0) / (m1 - m0)) * (t1 - t0)
    }
  }
  const [tEnd, mEnd] = profile.at(-1)
  if (mEnd < distanceM - cfg.finishToleranceM || mEnd <= 0) return null
  // Closing pace: from the last fix at least a window's distance back.
  let from = profile[0]
  for (let i = profile.length - 1; i >= 0; i--) {
    if (profile[i][1] <= mEnd - cfg.finishPaceWindowM) {
      from = profile[i]
      break
    }
  }
  const speed = (mEnd - from[1]) / (tEnd - from[0])
  if (!(speed > 0)) return null
  return tEnd + (distanceM - mEnd) / speed
}

/**
 * The profile up to `distanceM`, ending exactly on the line — what the other
 * side of a duel races. Null if the run never got there.
 */
export function cutProfile(profile, distanceM, cfg = DUEL) {
  const finish = timeToCover(profile, distanceM, cfg)
  if (finish == null) return null
  const cut = profile.filter(([t, m]) => t < finish && m < distanceM)
  cut.push([finish, distanceM])
  return cut
}

/** How far the ghost had got `elapsedMs` into its run; it waits at its finish. */
export function ghostMetresAt(profile, elapsedMs) {
  if (!profile?.length || elapsedMs <= 0) return 0
  let lo = 0
  let hi = profile.length - 1
  if (elapsedMs >= profile[hi][0]) return profile[hi][1]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (profile[mid][0] <= elapsedMs) lo = mid
    else hi = mid
  }
  const [t0, m0] = profile[lo]
  const [t1, m1] = profile[hi]
  return t1 === t0 ? m1 : m0 + ((elapsedMs - t0) / (t1 - t0)) * (m1 - m0)
}
