import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { loadMigrations, runMigrations } from './migrate.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
const migrations = await loadMigrations(dir)
const quiet = {}

const tables = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name)
const applied = (db) =>
  db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version)
const fresh = () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return db
}

test('a fresh database gets every migration, once', () => {
  const db = fresh()
  const first = runMigrations(db, migrations, quiet)
  assert.deepEqual(first.map((m) => m.version), migrations.map((m) => m.version))
  for (const table of ['players', 'sessions', 'auth_codes', 'schema_migrations']) {
    assert.ok(tables(db).includes(table), table)
  }
  assert.deepEqual(runMigrations(db, migrations, quiet), [])
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
})

test('anonymous accounts and everything pointing at them are deleted', () => {
  const db = fresh()
  // A database as it stood before migrations: the baseline schema, with data.
  runMigrations(db, migrations.filter((m) => m.version === 1), quiet)
  const player = db.prepare(
    'INSERT INTO players (id, display_name, phone, created_at) VALUES (?, ?, ?, 0)'
  )
  player.run('p', 'Phone One', '+353870000001')
  player.run('q', 'Phone Two', '+353870000002')
  player.run('anon', 'Anonymous', null)
  db.prepare("INSERT INTO sessions VALUES ('tok-p', 'p', 0, 9)").run()
  const challenge = db.prepare(
    "INSERT INTO challenges (id, from_id, to_id, distance_m, created_at, expires_at) VALUES (?, ?, ?, 1000, 0, 1)"
  )
  challenge.run('c-anon', 'p', 'anon')
  challenge.run('c-ok', 'p', 'q')
  const match = db.prepare(
    'INSERT INTO matches (id, challenge_id, a_id, b_id, distance_m, winner_id, a_rating_before, b_rating_before, started_at) VALUES (?, ?, ?, ?, 1000, ?, 1000, 1000, 0)'
  )
  match.run('m-anon', 'c-anon', 'p', 'anon', 'anon')
  match.run('m-ok', 'c-ok', 'p', 'q', 'q')

  // Up to the migration under test; later ones drop the stranger-duel tables.
  const ran = runMigrations(db, migrations.filter((m) => m.version <= 3), quiet)
  assert.ok(ran.some((m) => m.name === 'drop_anonymous_players'))
  assert.deepEqual(db.prepare('SELECT id FROM players ORDER BY id').all().map((r) => r.id), ['p', 'q'])
  assert.deepEqual(db.prepare('SELECT token FROM sessions').all().map((r) => r.token), ['tok-p'])
  assert.deepEqual(db.prepare('SELECT id FROM challenges').all().map((r) => r.id), ['c-ok'])
  assert.deepEqual(db.prepare('SELECT id FROM matches').all().map((r) => r.id), ['m-ok'])
  assert.deepEqual(db.pragma('foreign_key_check'), [])
  runMigrations(db, migrations, quiet)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})

test('existing players keep a starting hidden rating and their old tier', () => {
  const db = fresh()
  runMigrations(db, migrations.filter((m) => m.version <= 3), quiet)
  const player = db.prepare(
    'INSERT INTO players (id, display_name, rating, created_at) VALUES (?, ?, ?, 0)'
  )
  player.run('a', 'Gold Runner', 1300)
  player.run('b', 'New Runner', 1000)
  runMigrations(db, migrations, quiet)
  const rows = db.prepare('SELECT id, mmr, ladder_tier FROM players ORDER BY id').all()
  assert.deepEqual(rows, [
    { id: 'a', mmr: 1300, ladder_tier: 'gold' },
    { id: 'b', mmr: 1000, ladder_tier: 'bronze' },
  ])
  const columns = db.prepare('PRAGMA table_info(players)').all().map((c) => c.name)
  for (const gone of ['rating', 'wins', 'lat', 'lng']) assert.ok(!columns.includes(gone), gone)
})

test('the oldest players layout is rebuilt before the baseline lands', () => {
  const db = fresh()
  db.exec(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY, handle TEXT NOT NULL, email TEXT UNIQUE,
      rating INTEGER NOT NULL DEFAULT 1000, peak_rating INTEGER NOT NULL DEFAULT 1000,
      games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
      lat REAL, lng REAL, located_at INTEGER, last_seen_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE auth_codes (id TEXT PRIMARY KEY, phone TEXT, code TEXT);
    INSERT INTO players (id, handle, created_at) VALUES ('old', 'Old Timer', 0);
  `)
  runMigrations(db, migrations, quiet)
  const columns = db.prepare('PRAGMA table_info(players)').all().map((c) => c.name)
  assert.ok(columns.includes('display_name'))
  assert.ok(!columns.includes('handle'))
  assert.ok(db.prepare('PRAGMA table_info(auth_codes)').all().some((c) => c.name === 'code_hash'))
  // It had no phone number, so it could never sign in again: gone.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n, 0)
})

test('a failing migration rolls back and is not recorded', () => {
  const db = fresh()
  const steps = [
    { version: 1, name: 'ok', up: (d) => d.exec('CREATE TABLE kept (x)') },
    {
      version: 2,
      name: 'boom',
      up: (d) => {
        d.exec('CREATE TABLE lost (x)')
        throw new Error('boom')
      },
    },
  ]
  assert.throws(() => runMigrations(db, steps, quiet), /boom/)
  assert.ok(tables(db).includes('kept'))
  assert.ok(!tables(db).includes('lost'))
  assert.deepEqual(applied(db), [1])
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
})

test('a migration that leaves a dangling reference is rolled back', () => {
  const db = fresh()
  runMigrations(db, migrations, quiet)
  const bad = [{
    version: 900,
    name: 'orphan',
    up: (d) => d.exec("INSERT INTO sessions VALUES ('orphan', 'nobody', 0, 1)"),
  }]
  assert.throws(() => runMigrations(db, bad, quiet), /dangling reference/)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token = 'orphan'").get().n, 0)
  assert.ok(!applied(db).includes(900))
})

test('two migrations with the same number are refused', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gapped-migrations-'))
  fs.writeFileSync(path.join(tmp, '001_one.sql'), 'SELECT 1;')
  fs.writeFileSync(path.join(tmp, '001_two.sql'), 'SELECT 2;')
  fs.writeFileSync(path.join(tmp, 'notes.txt'), 'ignored')
  await assert.rejects(loadMigrations(tmp), /share a number/)
  fs.rmSync(tmp, { recursive: true })
})
