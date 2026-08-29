import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { DATABASE_PATH } from '../config.js'

const here = path.dirname(fileURLToPath(import.meta.url))

// The directory the env var points at will not exist on a fresh volume.
fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true })

export const db = new Database(DATABASE_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'))

const columnsOf = (table) =>
  db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)

/**
 * Rebuild the players table into the current shape, keeping ids, ratings and
 * match history. Needed for two legacy generations:
 *
 *  - the original scaffold, which named players by `handle`
 *  - the email era, whose inline `email TEXT UNIQUE` blocks a plain
 *    ALTER TABLE DROP COLUMN
 *
 * A phone column is carried across when the old table has one — phone is
 * once again the credential, so those numbers sign straight back in.
 * Sessions reference players by id, which survives the rebuild, so nobody
 * gets logged out.
 */
function rebuildPlayers(reason, columns, log) {
  log?.warn?.(`rebuilding players table (${reason})`)

  const name = columns.includes('handle') ? 'handle' : 'display_name'
  const phone = columns.includes('phone') ? 'phone' : 'NULL'

  // Foreign keys must be off while the table is swapped, and the pragma
  // cannot change inside a transaction.
  db.pragma('foreign_keys = OFF')
  db.transaction(() => {
    db.exec(`
      CREATE TABLE players_migrated (
        id           TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        phone        TEXT,
        rating       INTEGER NOT NULL DEFAULT 1000,
        peak_rating  INTEGER NOT NULL DEFAULT 1000,
        games        INTEGER NOT NULL DEFAULT 0,
        wins         INTEGER NOT NULL DEFAULT 0,
        losses       INTEGER NOT NULL DEFAULT 0,
        draws        INTEGER NOT NULL DEFAULT 0,
        lat          REAL,
        lng          REAL,
        located_at   INTEGER,
        last_seen_at INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL
      )
    `)
    db.exec(`
      INSERT INTO players_migrated
        (id, display_name, phone, rating, peak_rating, games, wins, losses, draws,
         lat, lng, located_at, last_seen_at, created_at)
      SELECT id, ${name}, ${phone}, rating, peak_rating, games, wins, losses, draws,
             lat, lng, located_at, last_seen_at, created_at
      FROM players
    `)
    db.exec('DROP TABLE players')
    db.exec('ALTER TABLE players_migrated RENAME TO players')
    db.exec('CREATE INDEX IF NOT EXISTS idx_players_rating   ON players (rating DESC)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_players_location ON players (lat, lng)')
  })()
  db.pragma('foreign_keys = ON')
  return true
}

function migrateLegacyPlayers(log) {
  const columns = columnsOf('players')
  if (columns.length === 0) return false // fresh database; the schema made it
  if (columns.includes('handle')) return rebuildPlayers('handle era', columns, log)
  if (columns.includes('email') || columns.includes('password_hash')) {
    return rebuildPlayers('email era', columns, log)
  }
  return false
}

/**
 * Every database converges on a nullable phone column with a partial unique
 * index. Null stays legal — accounts predating phone sign-in keep working on
 * their stored id until a number is attached.
 */
function ensurePhoneColumn(log) {
  if (!columnsOf('players').includes('phone')) {
    db.exec('ALTER TABLE players ADD COLUMN phone TEXT')
    log?.warn?.('added phone column to players')
  }
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_phone_unique ' +
    'ON players (phone) WHERE phone IS NOT NULL'
  )
}

/**
 * Add duel-mode columns to challenges and matches created before timed duels
 * existed. Every old row keeps working: it simply reads as a 'race'.
 */
function addDuelModeColumns(log) {
  const added = []
  for (const table of ['challenges', 'matches']) {
    const columns = columnsOf(table)
    if (columns.length === 0) continue // fresh database; schema creates them
    if (!columns.includes('mode')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN mode TEXT NOT NULL DEFAULT 'race'`)
      added.push(`${table}.mode`)
    }
    if (!columns.includes('duration_ms')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN duration_ms INTEGER`)
      added.push(`${table}.duration_ms`)
    }
  }
  if (added.length) log?.warn?.(`added duel mode columns: ${added.join(', ')}`)
  return added
}

function migrate(log) {
  const changed = migrateLegacyPlayers(log)
  // The original scaffold had an auth_codes table with a different shape;
  // a table without code_hash cannot serve the current statements.
  const authColumns = columnsOf('auth_codes')
  if (authColumns.length > 0 && !authColumns.includes('code_hash')) {
    db.exec('DROP TABLE auth_codes')
    log?.warn?.('dropped incompatible legacy auth_codes table')
  }
  ensurePhoneColumn(log)
  addDuelModeColumns(log)
  return changed
}

// Runs at import, before any other module prepares a statement — those
// prepares reference display_name and would throw against an old table.
export const MIGRATED = migrate(console)
// The schema runs before the migration, so a table the migration dropped
// needs recreating. Cheap, and idempotent.
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'))

export const now = () => Date.now()
