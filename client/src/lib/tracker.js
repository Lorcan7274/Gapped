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

// Readings worse than this are too noisy to trust for a race.
const MAX_ACCURACY_M = 35
// Below this, a "movement" is almost certainly GPS drift while standing still.
const MIN_STEP_M = 3
// Above roughly 12 m/s a runner has teleported; drop the sample.
const MAX_SPEED_MPS = 12

/**
 * Accumulates real distance travelled from GPS fixes, discarding the noise
 * that would otherwise let someone win a race by standing still.
 */
export function createTracker({ onUpdate, onError }) {
  let watchId = null
  let previous = null
  let total = 0
  let startedAt = null

  function handle(position) {
    const { latitude: lat, longitude: lng, accuracy } = position.coords
    const at = position.timestamp

    if (accuracy > MAX_ACCURACY_M) {
      onUpdate({ metres: total, accuracy, quality: 'poor' })
      return
    }

    const point = { lat, lng, at }
    if (previous) {
      const step = distanceMetres(previous, point)
      const seconds = Math.max((at - previous.at) / 1000, 0.001)
      const speed = step / seconds
      if (step >= MIN_STEP_M && speed <= MAX_SPEED_MPS) {
        total += step
        previous = point
      } else if (step >= MIN_STEP_M) {
        // Implausible jump: re-anchor without crediting the distance.
        previous = point
      }
    } else {
      previous = point
    }

    onUpdate({
      metres: total,
      accuracy,
      quality: accuracy <= 12 ? 'good' : 'fair',
      elapsedMs: startedAt ? at - startedAt : 0,
    })
  }

  return {
    start() {
      if (!('geolocation' in navigator)) {
        onError(new Error('This device cannot report its location.'))
        return
      }
      startedAt = Date.now()
      total = 0
      previous = null
      watchId = navigator.geolocation.watchPosition(handle, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      })
    },
    stop() {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    },
    // Dev-only escape hatch so the race UI can be exercised at a desk.
    advance(metres) {
      total += metres
      onUpdate({
        metres: total,
        accuracy: 5,
        quality: 'good',
        elapsedMs: startedAt ? Date.now() - startedAt : 0,
      })
    },
    get metres() {
      return total
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
