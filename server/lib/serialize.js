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
    week: row.week,
    distanceM: Math.round(row.distance_m),
    elapsedMs: row.elapsed_ms,
    // 'ok', or 'quarantined': flagged, settled unranked pending review.
    status: row.status,
    shards: row.shards,
    fuel: row.fuel,
    points: row.points,
  }
}

/**
 * A ghost duel as one of its two players sees it. Margins and points are
 * from the viewer's side; the hidden-rating movement never leaves the server.
 */
export function serializeDuel(row, viewerId, players) {
  if (!row) return null
  const role = row.challenger_id === viewerId ? 'challenger' : 'target'
  const opponent = players.get(role === 'challenger' ? row.target_id : row.challenger_id)
  const sign = role === 'challenger' ? 1 : -1
  const done = row.status === 'settled' || row.status === 'void'
  let you = null
  if (done) {
    const winner = { challenger: 'challenger', target: 'target', walkover: 'challenger' }[row.outcome]
    you = row.outcome === 'tie' ? 'tie'
      : winner ? (winner === role ? 'won' : 'lost')
      : row.outcome === 'withdrawn' && role === 'challenger' ? 'quit'
      : 'none'
  }
  return {
    id: row.id,
    week: row.week,
    status: row.status,
    role,
    opponent: publicPlayer(opponent),
    distanceM: Math.round(row.distance_m),
    // The ghost the challenger raced: the target's run.
    ghostMs: row.ghost_ms,
    legs: {
      challenger: { ms: row.leg1_ms, quit: Boolean(row.leg1_quit) },
      target: row.leg2_started_at ? { ms: row.leg2_ms, quit: Boolean(row.leg2_quit) } : null,
    },
    // The reply is the target's to run, until Sunday night.
    yourTurn: role === 'target' && row.status === 'awaiting',
    result: done
      ? {
          outcome: row.outcome,
          you,
          marginMs: row.margin_ms == null ? null : sign * row.margin_ms,
          points: (role === 'challenger' ? row.challenger_points : row.target_points) ?? 0,
        }
      : null,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  }
}
