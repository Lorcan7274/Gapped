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
 * A step must clear this before it counts as movement. Two phones sitting
 * still on a table still report positions that wander by a few metres a
 * second, and crediting every wobble is what made a 400 m lap read 500 m
 * and two minutes of standing still read hundreds of metres.
 */
export const MIN_STEP_M = 8
/**
 * A step also has to be large relative to the fix's own uncertainty. A 3 m
 * move reported with 20 m accuracy is not a measurement, it is noise.
 */
export const ACCURACY_STEP_RATIO = 0.5
/**
 * Metres per second of genuine movement the smoother expects. Higher trusts
 * each raw fix more and tracks sharp changes faster; lower trusts the
 * running estimate and rejects more noise. 2.5 keeps a bend honest without
 * letting a stationary phone wander.
 */
export const PROCESS_NOISE_MPS = 2.5

/**
 * A position smoother, one Kalman step per axis.
 *
 * Filtering alone cannot fix distance: a fix inside the accuracy limit is
 * still wrong by metres, and summing those errors is what made a 400 m lap
 * read 500 m. Averaging each new fix against the running estimate, weighted
 * by how uncertain the fix says it is, removes most of that before any
 * distance is measured.
 */
function createSmoother() {
  let lat = null, lng = null, variance = -1, at = 0
  return {
    push(nextLat, nextLng, accuracy, timestamp) {
      const acc = Math.max(1, accuracy ?? 10)
      if (variance < 0) {
        lat = nextLat; lng = nextLng; variance = acc * acc; at = timestamp
      } else {
        const seconds = Math.max((timestamp - at) / 1000, 0)
        at = timestamp
        variance += seconds * PROCESS_NOISE_MPS * PROCESS_NOISE_MPS
        const gain = variance / (variance + acc * acc)
        lat += gain * (nextLat - lat)
        lng += gain * (nextLng - lng)
        variance = (1 - gain) * variance
      }
      return { lat, lng }
    },
    reset() { lat = null; lng = null; variance = -1; at = 0 },
  }
}
/** Pace is averaged over this much recent movement. */
export const PACE_WINDOW_MS = 30_000

export const REJECT_ACCURACY = 'accuracy'
export const REJECT_SPEED = 'speed'
export const HELD_NOISE = 'noise'

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
  let heldNoise = 0
  let lastAccuracy = null
  let lastRejection = null
  const smoother = createSmoother()
  // Recent accepted fixes: { at, total } — enough to average pace over a window.
  let trail = []

  function emit() {
    onUpdate?.({
      metres: total,
      accepted,
      rejected,
      rejectedAccuracy,
      rejectedSpeed,
      heldNoise,
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

    // Smooth first, then measure. Distance is only ever taken between
    // smoothed positions, never raw fixes.
    const smoothed = smoother.push(lat, lng, accuracy, at)
    const point = { lat: smoothed.lat, lng: smoothed.lng, at }

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

      // Hold the anchor until the displacement is big enough to be real.
      // Crucially the anchor is NOT moved, so genuine slow movement still
      // accumulates and gets credited in full once it clears the bar —
      // only jitter, which returns to where it started, is dropped.
      const floor = Math.max(MIN_STEP_M, (accuracy ?? 0) * ACCURACY_STEP_RATIO)
      if (step < floor) {
        heldNoise += 1
        lastAccuracy = accuracy
        lastRejection = HELD_NOISE
        emit()
        return
      }

      total += step
    }

    previous = point
    accepted += 1
    lastRejection = null
    trail.push({ at, total })
    // Keep a little more than the pace window so the oldest sample in range
    // is always available.
    const cutoff = at - PACE_WINDOW_MS * 2
    if (trail.length > 4 && trail[0].at < cutoff) {
      trail = trail.filter((p) => p.at >= cutoff)
    }
    emit()
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
      smoother.reset()
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
