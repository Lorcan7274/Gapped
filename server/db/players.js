import { db, now } from './index.js'
import { newId } from '../lib/ids.js'
import { STARTING_RATING } from '../lib/elo.js'
import { boundingBox, distanceMetres } from '../lib/geo.js'

const PUBLIC_COLUMNS = `
  id, handle, rating, peak_rating, games, wins, losses, draws,
  lat, lng, located_at, last_seen_at, created_at
`

const selectById = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM players WHERE id = ?`)
const selectByPhone = db.prepare('SELECT * FROM players WHERE phone = ?')
const selectByHandle = db.prepare('SELECT id FROM players WHERE handle = ? COLLATE NOCASE')

const insertPlayer = db.prepare(`
  INSERT INTO players (id, phone, handle, rating, peak_rating, created_at, last_seen_at)
  VALUES (@id, @phone, @handle, @rating, @rating, @created_at, @created_at)
`)

const updateLocation = db.prepare(`
  UPDATE players SET lat = ?, lng = ?, located_at = ?, last_seen_at = ? WHERE id = ?
`)

const touch = db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?')

const updateHandle = db.prepare('UPDATE players SET handle = ? WHERE id = ?')

export const getPlayer = (id) => selectById.get(id) ?? null
export const getPlayerByPhone = (phone) => selectByPhone.get(phone) ?? null
export const handleTaken = (handle) => Boolean(selectByHandle.get(handle))

export function createPlayer({ phone, handle }) {
  const player = {
    id: newId(),
    phone,
    handle,
    rating: STARTING_RATING,
    created_at: now(),
  }
  insertPlayer.run(player)
  return getPlayer(player.id)
}

export function setLocation(id, lat, lng) {
  const ts = now()
  updateLocation.run(lat, lng, ts, ts, id)
  return getPlayer(id)
}

export const touchPlayer = (id) => touch.run(now(), id)

export function renamePlayer(id, handle) {
  updateHandle.run(handle, id)
  return getPlayer(id)
}

/**
 * Opponents near `player`, ranked by how good a match they are.
 * Filtered on distance and rating gap; sorted by rating gap, then distance.
 */
export function findNearby(player, { radiusM, ratingSpread, presenceTtlMs, limit = 40 }) {
  if (player.lat == null || player.lng == null) return []

  const box = boundingBox(player.lat, player.lng, radiusM)
  const rows = db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM players
       WHERE id != @id
         AND lat IS NOT NULL AND lng IS NOT NULL
         AND lat BETWEEN @minLat AND @maxLat
         AND lng BETWEEN @minLng AND @maxLng
         AND last_seen_at >= @since
         AND rating BETWEEN @minRating AND @maxRating`
    )
    .all({
      id: player.id,
      ...box,
      since: now() - presenceTtlMs,
      minRating: player.rating - ratingSpread,
      maxRating: player.rating + ratingSpread,
    })

  return rows
    .map((row) => ({
      ...row,
      distance_m: Math.round(
        distanceMetres(player.lat, player.lng, row.lat, row.lng)
      ),
      rating_gap: Math.abs(row.rating - player.rating),
    }))
    .filter((row) => row.distance_m <= radiusM)
    .sort((x, y) => x.rating_gap - y.rating_gap || x.distance_m - y.distance_m)
    .slice(0, limit)
}

export function leaderboard({ limit = 50, offset = 0 } = {}) {
  return db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM players
       WHERE games > 0
       ORDER BY rating DESC, wins DESC, id ASC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset)
}

export function rankOf(playerId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) + 1 AS rank FROM players
       WHERE games > 0
         AND rating > (SELECT rating FROM players WHERE id = ?)`
    )
    .get(playerId)
  return row?.rank ?? null
}
