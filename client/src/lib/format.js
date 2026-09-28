// Metres below a kilometre, kilometres above. There is no imperial path:
// mixing the two was the confusing part, and one system beats a toggle.
export function metres(value) {
  if (value == null) return '—'
  if (value < 1000) return `${Math.round(value)} m`
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} km`
}

export function distanceLabel(value) {
  if (value == null) return '—'
  return value < 1000 ? `${value} m` : `${value / 1000} km`
}

export function clock(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—:—'
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** A time difference with a true sign: +0:12, −1:03, ±0:00. */
export function signedClock(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—:—'
  const sign = Math.round(ms / 1000) === 0 ? '±' : ms > 0 ? '+' : '−'
  return `${sign}${clock(Math.abs(ms))}`
}

export function preciseClock(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—:—.—'
  const tenths = Math.floor((Math.max(0, ms) % 1000) / 100)
  return `${clock(ms)}.${tenths}`
}

// Pace in minutes per kilometre.
export function pace(elapsedMs, metresRun) {
  if (!elapsedMs || !metresRun || metresRun < 20) return '—:—'
  const msPerKm = (elapsedMs / metresRun) * 1000
  return `${clock(msPerKm)} /km`
}

export const signed = (n) => (n > 0 ? `+${n}` : String(n))

export function ago(timestamp) {
  if (!timestamp) return 'never'
  const seconds = Math.round((Date.now() - timestamp) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86_400)}d ago`
}

/**
 * Coarse calendar distance for history: Today, Yesterday, 3d ago, 2w ago,
 * 4mo ago. Counted in local calendar days, so last night is Yesterday.
 */
export function daysAgo(timestamp) {
  if (!timestamp) return ''
  const day = (t) => {
    const d = new Date(t)
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000
  }
  const days = Math.max(0, day(Date.now()) - day(timestamp))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}
