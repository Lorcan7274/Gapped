import { tierFor } from './elo.js'
import { distanceMetres } from './geo.js'
import { phoneOf } from '../db/players.js'

/**
 * What one player may see about another. Raw coordinates never leave the
 * server — a viewer gets a distance, and only when both sides have a
 * position. Everything else is public by design.
 */
export function publicPlayer(row, viewer = null, extra = {}) {
  if (!row) return null
  const tier = tierFor(row.rating)

  // Distance and rating gap are computed here, relative to whoever is
  // asking, so raw coordinates never leave the server.
  let distanceM = null
  let ratingGap = null
  if (viewer && viewer.id !== row.id) {
    ratingGap = Math.abs(row.rating - viewer.rating)
    if (viewer.lat != null && viewer.lng != null && row.lat != null && row.lng != null) {
      distanceM = Math.round(distanceMetres(viewer.lat, viewer.lng, row.lat, row.lng))
    }
  }

  return {
    id: row.id,
    displayName: row.display_name,
    rating: row.rating,
    peakRating: row.peak_rating,
    games: row.games,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    tier: { key: tier.key, name: tier.name, colour: tier.colour },
    hasLocation: row.lat != null && row.lng != null,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    ...(distanceM != null ? { distanceM } : {}),
    ...(ratingGap != null ? { ratingGap } : {}),
    ...(row.distance_m != null ? { distanceM: row.distance_m } : {}),
    ...(row.rating_gap != null ? { ratingGap: row.rating_gap } : {}),
    ...extra,
  }
}

/** The viewer's own record, which may include their own coordinates. */
export function selfPlayer(row, extra = {}) {
  const phone = phoneOf(row.id)
  return {
    ...publicPlayer(row, null, extra),
    lat: row.lat,
    lng: row.lng,
    locatedAt: row.located_at,
    // Your own number, and whether "leave" means "sign out" or "lose the
    // account". Nobody else's serialisation ever carries a phone.
    phone,
    hasAccount: phone != null,
  }
}

export function publicMatch(row, viewerId) {
  if (!row) return null
  const viewerIsA = row.a_id === viewerId
  return {
    id: row.id,
    mode: row.mode ?? 'race',
    distanceM: row.distance_m,
    durationMs: row.duration_ms ?? null,
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
      displayName: viewerIsA ? row.b_name : row.a_name,
      progressM: viewerIsA ? row.b_progress_m : row.a_progress_m,
      elapsedMs: viewerIsA ? row.b_elapsed_ms : row.a_elapsed_ms,
      ratingBefore: viewerIsA ? row.b_rating_before : row.a_rating_before,
      ratingAfter: viewerIsA ? row.b_rating_after : row.a_rating_after,
    },
  }
}
