import { settleDue } from '../db/duels.js'

/**
 * Sunday night settles everything — the game's only timer. Rather than fire
 * once at midnight (and miss it across a restart), this checks every minute
 * for duels whose week is over; settling is idempotent, so a server that was
 * down at midnight catches up the moment it boots.
 */
export function startSundayJob(log, { intervalMs = 60_000 } = {}) {
  const tick = () => {
    try {
      const settled = settleDue(Date.now())
      if (settled > 0) log.info({ settled }, 'settled duels whose week is over')
    } catch (error) {
      log.error({ err: error }, 'duel settlement failed')
    }
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
