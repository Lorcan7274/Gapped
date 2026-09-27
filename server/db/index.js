import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { DATABASE_PATH } from '../config/env.js'
import { loadMigrations, runMigrations } from './migrate.js'

const here = path.dirname(fileURLToPath(import.meta.url))

// The directory the env var points at will not exist on a fresh volume.
fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true })

export const db = new Database(DATABASE_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Runs at import, before any other module prepares a statement — those
// prepares would throw against a schema that has not caught up yet.
export const APPLIED_MIGRATIONS = runMigrations(
  db,
  await loadMigrations(path.join(here, 'migrations')),
  console
)

export const now = () => Date.now()
