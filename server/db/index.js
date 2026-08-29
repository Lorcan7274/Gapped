import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { DATABASE_PATH } from '../config.js'

const here = path.dirname(fileURLToPath(import.meta.url))

// Make sure the directory the env var points at actually exists — on a fresh
// Railway volume it will not.
fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true })

export const db = new Database(DATABASE_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'))

export const now = () => Date.now()
