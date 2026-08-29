export function metres(value) {
  if (value == null) return '—'
  if (value < 1000) return `${Math.round(value)} m`
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} km`
}

export function distanceLabel(value) {
  if (value == null) return '—'
  return value < 1000 ? `${value}m` : `${value / 1000}k`
}

export function clock(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—:—'
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
