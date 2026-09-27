import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Schema changes are numbered migration files in db/migrations, applied in
 * order and recorded in schema_migrations — never edits to a live schema.
 *
 *   NNN_what_it_does.sql   plain SQL, run as one script
 *   NNN_what_it_does.js    exports up(db, log), for changes SQL alone cannot
 *                          express (checking which legacy columns exist)
 *
 * Each migration runs in its own transaction with foreign keys switched off
 * — the procedure SQLite documents for rebuilding tables — and has to leave
 * no dangling references behind: foreign_key_check runs before the commit,
 * and a violation rolls the migration back. Because cascades do not fire
 * while foreign keys are off, a migration that deletes rows deletes their
 * dependants explicitly.
 */

const FILE = /^(\d{3})_([a-z0-9_]+)\.(sql|js)$/

export async function loadMigrations(dir) {
  const migrations = []
  for (const file of fs.readdirSync(dir).sort()) {
    const match = FILE.exec(file)
    if (!match) continue
    const [, number, name, kind] = match
    const full = path.join(dir, file)
    let up
    if (kind === 'sql') {
      const sql = fs.readFileSync(full, 'utf8')
      up = (db) => db.exec(sql)
    } else {
      const mod = await import(pathToFileURL(full).href)
      if (typeof mod.up !== 'function') throw new Error(`${file} does not export up(db, log)`)
      up = mod.up
    }
    migrations.push({ version: Number(number), name, up })
  }
  const versions = migrations.map((m) => m.version)
  if (new Set(versions).size !== versions.length) {
    throw new Error(`Two migrations share a number: ${versions.join(', ')}`)
  }
  return migrations
}

/** Applies every migration not yet recorded. Returns the ones it applied. */
export function runMigrations(db, migrations, log) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  INTEGER NOT NULL
    )
  `)
  const done = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  )
  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((m) => !done.has(m.version))
  if (pending.length === 0) return []

  const record = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  )
  const applied = []
  // The pragma cannot change inside a transaction, so it brackets them all.
  db.pragma('foreign_keys = OFF')
  try {
    for (const migration of pending) {
      db.transaction(() => {
        migration.up(db, log)
        const dangling = db.pragma('foreign_key_check')
        if (dangling.length > 0) {
          throw new Error(
            `Migration ${migration.version}_${migration.name} leaves ${dangling.length} ` +
            `dangling reference(s), first in ${dangling[0].table}`
          )
        }
        record.run(migration.version, migration.name, Date.now())
      })()
      log?.info?.(`applied migration ${migration.version}_${migration.name}`)
      applied.push(migration)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
  return applied
}
