import { db, now } from '../db/index.js'

/**
 * Which player an external identity signs in as. A provider names its own
 * identities — 'phone' uses the E.164 number as the subject — and the pair is
 * unique, so one number can only ever reach one account.
 */

const select = db.prepare(
  'SELECT player_id FROM auth_identities WHERE provider = ? AND subject = ?'
)
const insert = db.prepare(
  'INSERT INTO auth_identities (provider, subject, player_id, created_at) VALUES (?, ?, ?, ?)'
)
const ofPlayer = db.prepare(
  'SELECT provider, subject FROM auth_identities WHERE player_id = ? ORDER BY created_at'
)

export const playerIdFor = (provider, subject) =>
  subject ? select.get(provider, subject)?.player_id ?? null : null

/** Throws a SQLITE_CONSTRAINT error if another account already holds it. */
export const linkIdentity = (provider, subject, playerId) =>
  insert.run(provider, subject, playerId, now())

export const identitiesOf = (playerId) => (playerId ? ofPlayer.all(playerId) : [])
