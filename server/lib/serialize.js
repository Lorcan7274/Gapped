import { tierFor } from './elo.js'

// Everything a client is allowed to see about a player. Phone never leaves
// the server; coordinates only go out as a distance the caller already knows.
export function publicPlayer(row, extra = {}) {
  if (!row) return null
  const tier = tierFor(row.rating)
  return {
    id: row.id,
    handle: row.handle,
    rating: row.rating,
    peakRating: row.peak_rating,
    games: row.games,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    tier: { key: tier.key, name: tier.name, colour: tier.colour },
    lastSeenAt: row.last_seen_at,
    ...(row.distance_m != null ? { distanceM: row.distance_m } : {}),
    ...(row.rating_gap != null ? { ratingGap: row.rating_gap } : {}),
    ...extra,
  }
}

export function selfPlayer(row, extra = {}) {
  return {
    ...publicPlayer(row, extra),
    hasLocation: row.lat != null && row.lng != null,
    locatedAt: row.located_at,
  }
}

export function publicMatch(row, viewerId) {
  if (!row) return null
  const viewerIsA = row.a_id === viewerId
  return {
    id: row.id,
    distanceM: row.distance_m,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    winnerId: row.winner_id,
    you: {
      id: viewerIsA ? row.a_id : row.b_id,
      progressM: viewerIsA ? row.a_progress_m : row.b_progress_m,
      elapsedMs: viewerIsA ? row.a_elapsed_ms : row.b_elapsed_ms,
      ratingBefore: viewerIsA ? row.a_rating_before : row.b_rating_before,
      ratingAfter: viewerIsA ? row.a_rating_after : row.b_rating_after,
    },
    opponent: {
      id: viewerIsA ? row.b_id : row.a_id,
      handle: viewerIsA ? row.b_handle : row.a_handle,
      progressM: viewerIsA ? row.b_progress_m : row.a_progress_m,
      elapsedMs: viewerIsA ? row.b_elapsed_ms : row.a_elapsed_ms,
      ratingBefore: viewerIsA ? row.b_rating_before : row.a_rating_before,
      ratingAfter: viewerIsA ? row.b_rating_after : row.a_rating_after,
    },
  }
}
