/**
 * Ghost replay: a run as [ms since its first GPS fix, metres covered]
 * pairs, as the server sends it (server/lib/ghost.js is the twin of this).
 */

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
