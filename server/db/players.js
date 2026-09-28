import { db, now } from './index.js'
import { newId } from '../lib/ids.js'
import { RATING } from '../config/game.js'

/**
 * Players: a display name, a hidden rating (never serialised — see
 * lib/serialize.js), a place on the visible ladder, and the currencies runs
 * pay into. How someone signs in is not the player's business; auth/ links
 * its own identities to the id.
 */

const COLUMNS = `
  id, display_name, mmr, mmr_results, ladder_tier, ladder_division,
  shards, fuel, streak_days, streak_last_day, lifetime_m, runs,
  last_seen_at, created_at
`

const selectById = db.prepare(`SELECT ${COLUMNS} FROM players WHERE id = ?`)
const insertPlayer = db.prepare(`
  INSERT INTO players (id, display_name, mmr, created_at, last_seen_at)
  VALUES (@id, @display_name, @mmr, @created_at, @created_at)
`)
const touch = db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?')
const rename = db.prepare('UPDATE players SET display_name = ? WHERE id = ?')

export const getPlayer = (id) => (id ? selectById.get(id) ?? null : null)

/** A new player starts provisional at the default hidden rating, bottom of the ladder. */
export function createPlayer({ displayName }) {
  const player = {
    id: newId(),
    display_name: displayName,
    mmr: RATING.defaultRating,
    created_at: now(),
  }
  insertPlayer.run(player)
  return getPlayer(player.id)
}

export const touchPlayer = (id) => touch.run(now(), id)

export function renamePlayer(id, displayName) {
  rename.run(displayName, id)
  return getPlayer(id)
}
