import { verifiedAs } from '../auth/index.js'
import { ladderPosition } from './ladder.js'
import { currentStreak, localDay } from './economy.js'

/**
 * What the wire sees. Never hand raw rows to a route or socket: rows carry
 * the hidden rating, which no player — including its owner — ever sees.
 */

/** What one player may see about another: a name and a place on the ladder. */
export function publicPlayer(row) {
  if (!row) return null
  return {
    id: row.id,
    displayName: row.display_name,
    tier: ladderPosition(row.ladder_tier, row.ladder_division),
    createdAt: row.created_at,
  }
}

/** The viewer's own record: their currencies and progress, still no rating. */
export function selfPlayer(row, extra = {}, now = Date.now()) {
  if (!row) return null
  return {
    ...publicPlayer(row),
    shards: row.shards,
    fuel: row.fuel,
    streak: currentStreak({ days: row.streak_days, lastDay: row.streak_last_day }, localDay(now)),
    lifetimeM: Math.round(row.lifetime_m),
    runs: row.runs,
    // How you signed in, shown only to you.
    verifiedAs: verifiedAs(row.id),
    ...extra,
  }
}

/** A recorded run, as its owner sees it. */
export function serializeRun(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    private: Boolean(row.private),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distanceM: Math.round(row.distance_m),
    elapsedMs: row.elapsed_ms,
    // 'ok', or 'quarantined': flagged, settled unranked pending review.
    status: row.status,
    shards: row.shards,
    fuel: row.fuel,
    points: row.points,
  }
}
