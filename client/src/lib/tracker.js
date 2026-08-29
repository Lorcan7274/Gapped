const EARTH_RADIUS_M = 6_371_000
const toRad = (deg) => (deg * Math.PI) / 180

export function distanceMetres(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** A fix reporting worse accuracy than this is not trusted at all. */
export const MAX_ACCURACY_M = 25
/** Faster than this from the last accepted fix means the fix is wrong. */
export const MAX_SPEED_MPS = 11
/**
 * Movement smaller than this from the last counted fix is jitter, not
 * running: the anchor holds until the runner has clearly moved, so standing
 * still no longer drip-feeds metres into the total. Real movement still
 * counts in full — it just lands in ≥3 m steps measured from the anchor.
 */
export const MIN_STEP_M = 3
/** Pace is averaged over this much recent movement. */
export const PACE_WINDOW_MS = 30_000

export const REJECT_ACCURACY = 'accuracy'
export const REJECT_SPEED = 'speed'

/**
 * Turns a stream of GPS fixes into a cumulative distance in metres.
 *
 * Two filters, in order:
 *   1. accuracy worse than 25 m  -> reject
 *   2. implied speed from the previous accepted fix over 11 m/s -> reject
 * Anything else is accepted and its distance from the previous accepted fix
 * is added to the total.
 *
 * The first accepted fix only anchors the trail; it adds no distance.
 */
export function createTracker({ onUpdate, onError } = {}) {
  let watchId = null
  let previous = null
  let total = 0
  let startedAt = null
  let accepted = 0
  let rejected = 0
  let rejectedAccuracy = 0
  let rejectedSpeed = 0
  let lastAccuracy = null
  let lastRejection = null
  // Recent accepted fixes: { at, total } — enough to average pace over a window.
  let trail = []

  function emit() {
    onUpdate?.({
      metres: total,
      accepted,
      rejected,
      rejectedAccuracy,
      rejectedSpeed,
      accuracy: lastAccuracy,
      lastRejection,
      elapsedMs: startedAt ? Date.now() - startedAt : 0,
      paceMsPerKm: paceMsPerKm(),
      running: watchId != null,
    })
  }

  /**
   * Pace over the last 30 seconds of movement, in ms per km. Null until there
   * is enough movement in the window to say anything meaningful.
   */
  function paceMsPerKm() {
    if (trail.length < 2) return null
    const newest = trail[trail.length - 1]
    const cutoff = newest.at - PACE_WINDOW_MS
    // Oldest sample still inside the window, or the oldest we have.
    const oldest = trail.find((p) => p.at >= cutoff) ?? trail[0]
    const metres = newest.total - oldest.total
    const elapsed = newest.at - oldest.at
    if (metres < 5 || elapsed < 3000) return null
    return (elapsed / metres) * 1000
  }

  function handle(position) {
    const { latitude: lat, longitude: lng, accuracy } = position.coords
    const at = position.timestamp
    lastAccuracy = accuracy

    if (accuracy > MAX_ACCURACY_M) {
      rejected += 1
      rejectedAccuracy += 1
      lastRejection = REJECT_ACCURACY
      emit()
      return
    }

    const point = { lat, lng, at }

    if (previous) {
      const step = distanceMetres(previous, point)
      const seconds = Math.max((at - previous.at) / 1000, 0.001)
      if (step / seconds > MAX_SPEED_MPS) {
        rejected += 1
        rejectedSpeed += 1
        lastRejection = REJECT_SPEED
        emit()
        return
      }
      if (step < MIN_STEP_M) {
        // Jitter floor: keep the anchor where it is. The trail still gets a
        // point so the pace window sees time passing without movement.
        accepted += 1
        lastRejection = null
        remember(at)
        emit()
        return
      }
      total += step
    }

    previous = point
    accepted += 1
    lastRejection = null
    remember(at)
    emit()
  }

  function remember(at) {
    trail.push({ at, total })
    // Keep a little more than the pace window so the oldest sample in range
    // is always available.
    const cutoff = at - PACE_WINDOW_MS * 2
    if (trail.length > 4 && trail[0].at < cutoff) {
      trail = trail.filter((p) => p.at >= cutoff)
    }
  }

  return {
    start() {
      if (watchId != null) return
      if (!('geolocation' in navigator)) {
        onError?.(new Error('This device cannot report its location.'))
        return
      }
      startedAt = Date.now()
      watchId = navigator.geolocation.watchPosition(handle, (err) => onError?.(err), {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      })
      emit()
    },
    stop() {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      watchId = null
      emit()
    },
    reset() {
      total = 0
      previous = null
      accepted = 0
      rejected = 0
      rejectedAccuracy = 0
      rejectedSpeed = 0
      lastAccuracy = null
      lastRejection = null
      trail = []
      startedAt = watchId != null ? Date.now() : null
      emit()
    },
    /**
     * Feed a synthetic fix, in the same shape the debug simulator and tests
     * use: { lat, lng, accuracy, timestamp }. Normalised to a GeolocationPosition
     * so it goes through exactly the same code path as a real fix.
     */
    push({ lat, lng, accuracy, timestamp }) {
      handle({
        coords: { latitude: lat, longitude: lng, accuracy },
        timestamp: timestamp ?? Date.now(),
      })
    },
    get metres() {
      return total
    },
    get running() {
      return watchId != null
    },
  }
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device cannot report its location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    )
  })
}
