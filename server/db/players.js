import { db, now } from './index.js'
import { newId } from '../lib/ids.js'
import { STARTING_RATING } from '../lib/elo.js'
import { boundingBox, distanceMetres } from '../lib/geo.js'

const COLUMNS = `
  id, display_name, rating, peak_rating, games, wins, losses, draws,
  lat, lng, located_at, last_seen_at, created_at
`

const selectById = db.prepare(`SELECT ${COLUMNS} FROM players WHERE id = ?`)

const insertPlayer = db.prepare(`
  INSERT INTO players
    (id, display_name, email, password_hash, rating, peak_rating,
     lat, lng, located_at, created_at, last_seen_at)
  VALUES
    (@id, @display_name, @email, @password_hash, @rating, @rating,
     @lat, @lng, @located_at, @created_at, @created_at)
`)

const selectByEmail = db.prepare('SELECT * FROM players WHERE email = ?')
const attachAccount = db.prepare(
  'UPDATE players SET email = ?, password_hash = ? WHERE id = ?'
)

const updateLocation = db.prepare(`
  UPDATE players SET lat = ?, lng = ?, located_at = ?, last_seen_at = ? WHERE id = ?
`)
const touch = db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?')
const rename = db.prepare('UPDATE players SET display_name = ? WHERE id = ?')

export const getPlayer = (id) => (id ? selectById.get(id) ?? null : null)

/**
 * Create a player from a display name. Coordinates are optional — a browser
 * that denies location still joins, just without a position.
 */
const selectCredentials = db.prepare(
  'SELECT email, password_hash FROM players WHERE id = ?'
)
const selectWithSecret = db.prepare('SELECT * FROM players WHERE id = ?')

/**
 * Whether this account has an email and password attached. The public row
 * deliberately omits both, so a caller cannot test for them by reading a
 * serialised player — it has to ask.
 */
export function hasCredentials(id) {
  if (!id) return false
  const row = selectCredentials.get(id)
  return Boolean(row?.email && row?.password_hash)
}

/** Row including the password hash. Never serialise this to a client. */
export const getPlayerByEmail = (email) => (email ? selectByEmail.get(email) ?? null : null)
export const getPlayerWithSecret = (id) =>
  id ? selectWithSecret.get(id) ?? null : null

/** Give an existing account an email and password without losing its rating. */
export function attachCredentials(id, email, passwordHash) {
  attachAccount.run(email, passwordHash, id)
  return getPlayer(id)
}

export function createPlayer({
  displayName, email = null, passwordHash = null, lat = null, lng = null,
}) {
  const hasCoords = lat != null && lng != null
  const player = {
    id: newId(),
    display_name: displayName,
    email,
    password_hash: passwordHash,
    rating: STARTING_RATING,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    located_at: hasCoords ? now() : null,
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
export function renamePlayer(id, displayName) {
  rename.run(displayName, id)
  return getPlayer(id)
}

/** Everyone who has joined, most recently active first. */
export function allPlayers({ limit = 200 } = {}) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM players ORDER BY last_seen_at DESC, created_at DESC LIMIT ?`)
    .all(limit)
}

export function leaderboard({ limit = 100, offset = 0 } = {}) {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM players
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

/** Opponents near a player, filtered on distance and rating gap. */
export function findNearby(player, { radiusM, ratingSpread, presenceTtlMs, limit = 40 }) {
  if (player.lat == null || player.lng == null) return []

  const box = boundingBox(player.lat, player.lng, radiusM)
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM players
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
    .map((row) => ({
      ...row,
      distance_m: Math.round(distanceMetres(player.lat, player.lng, row.lat, row.lng)),
      rating_gap: Math.abs(row.rating - player.rating),
    }))
    .filter((row) => row.distance_m <= radiusM)
    .sort((x, y) => x.rating_gap - y.rating_gap || x.distance_m - y.distance_m)
    .slice(0, limit)
}
