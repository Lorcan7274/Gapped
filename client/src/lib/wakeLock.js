import { useEffect } from 'react'

/** Keep the screen on while `active` — the phone must not sleep mid-run. */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active) return undefined
    let lock = null
    let released = false
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && !released) lock = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unsupported; the run still records */
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && acquire()
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release?.().catch(() => {})
    }
  }, [active])
}
