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
 * Moves a database created by the old phone-login build onto the join-by-name
 * schema. `CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so an
 * already-deployed volume needs the table rebuilt rather than recreated.
 * Ratings and match history are carried across; the phone column is dropped.
 */
function migrateFromPhoneAuth(log = console) {
  const columns = columnsOf('players')
  if (!columns.includes('phone') && !columns.includes('handle')) return false

  log.warn?.('migrating players table off phone auth')

  // Foreign keys must be off while the table is swapped, and the pragma
  // cannot change inside a transaction.
  db.pragma('foreign_keys = OFF')
  db.transaction(() => {
    db.exec(`
      CREATE TABLE players_migrated (
        id           TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
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
    const name = columns.includes('handle') ? 'handle' : 'display_name'
    db.exec(`
      INSERT INTO players_migrated
        (id, display_name, rating, peak_rating, games, wins, losses, draws,
         lat, lng, located_at, last_seen_at, created_at)
      SELECT id, ${name}, rating, peak_rating, games, wins, losses, draws,
             lat, lng, located_at, last_seen_at, created_at
      FROM players
    `)
    db.exec('DROP TABLE players')
    db.exec('ALTER TABLE players_migrated RENAME TO players')
    db.exec('CREATE INDEX IF NOT EXISTS idx_players_rating   ON players (rating DESC)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_players_location ON players (lat, lng)')
    // The old code-based tables are gone for good. Sessions are recreated
    // by the schema, so a phone-era database simply loses its old ones.
    db.exec('DROP TABLE IF EXISTS auth_codes')
  })()
  db.pragma('foreign_keys = ON')
  return true
}

/**
 * Add sign-in columns to a players table created before accounts existed.
 * Both are nullable, so every account already in the database keeps working
 * until someone attaches an email and password to it.
 */
function addAccountColumns(log) {
  const columns = columnsOf('players')
  const added = []
  if (!columns.includes('email')) {
    db.exec('ALTER TABLE players ADD COLUMN email TEXT')
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_email_unique ' +
      'ON players (email) WHERE email IS NOT NULL'
    )
    added.push('email')
  }
  if (!columns.includes('password_hash')) {
    db.exec('ALTER TABLE players ADD COLUMN password_hash TEXT')
    added.push('password_hash')
  }
  if (added.length) log?.warn?.(`added account columns: ${added.join(', ')}`)
  return added
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
  const changed = migrateFromPhoneAuth(log)
  db.exec('DROP TABLE IF EXISTS auth_codes')
  addAccountColumns(log)
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
