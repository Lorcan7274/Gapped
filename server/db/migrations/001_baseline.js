/**
 * Baseline: the schema as the hackathon build left it, plus the fix-ups that
 * build ran on every boot to bring older databases into line. Databases
 * created before migrations existed arrive here already holding most of
 * these tables, so every step is idempotent — on such a database this
 * migration mostly records that the baseline is in place.
 *
 * Tables the async rework replaces (challenges, matches, the location and
 * public-rating columns on players) are dropped by later migrations, not
 * edited here.
 */

const SCHEMA = `
-- A player is a display name plus a verified phone number. The number is
-- the credential: prove you hold it with a texted code and you are that
-- player, on any device.
CREATE TABLE IF NOT EXISTS players (
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  -- E.164. Uniqueness comes from idx_players_phone_unique, created below so
  -- old databases converge on it too (an inline UNIQUE cannot be added to an
  -- existing table).
  phone             TEXT,
  rating            INTEGER NOT NULL DEFAULT 1000,
  peak_rating       INTEGER NOT NULL DEFAULT 1000,
  games             INTEGER NOT NULL DEFAULT 0,
  wins              INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  draws             INTEGER NOT NULL DEFAULT 0,
  lat               REAL,
  lng               REAL,
  located_at        INTEGER,
  last_seen_at      INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_rating   ON players (rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_location ON players (lat, lng);

-- One row per texted code. The code itself is never stored — only a digest
-- salted with the number — and each row dies after five wrong guesses.
CREATE TABLE IF NOT EXISTS auth_codes (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  consumed_at  INTEGER,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON auth_codes (phone, created_at DESC);

-- Sign-in issues an opaque token; the token is the credential, not the id.
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_player ON sessions (player_id);

CREATE TABLE IF NOT EXISTS challenges (
  id            TEXT PRIMARY KEY,
  from_id       TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  to_id         TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- 'race' is first to distance_m; 'timed' is most metres inside duration_ms.
  -- A timed row stores distance_m = 0.
  mode          TEXT NOT NULL DEFAULT 'race',
  distance_m    INTEGER NOT NULL,
  duration_ms   INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  responded_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_challenges_to   ON challenges (to_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_from ON challenges (from_id, status);

CREATE TABLE IF NOT EXISTS matches (
  id              TEXT PRIMARY KEY,
  challenge_id    TEXT REFERENCES challenges (id) ON DELETE SET NULL,
  a_id            TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  b_id            TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  mode            TEXT NOT NULL DEFAULT 'race',
  distance_m      INTEGER NOT NULL,
  duration_ms     INTEGER,
  status          TEXT NOT NULL DEFAULT 'live',
  winner_id       TEXT REFERENCES players (id) ON DELETE SET NULL,
  a_rating_before INTEGER NOT NULL,
  b_rating_before INTEGER NOT NULL,
  a_rating_after  INTEGER,
  b_rating_after  INTEGER,
  a_progress_m    REAL NOT NULL DEFAULT 0,
  b_progress_m    REAL NOT NULL DEFAULT 0,
  a_elapsed_ms    INTEGER,
  b_elapsed_ms    INTEGER,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_matches_a      ON matches (a_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_b      ON matches (b_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
`

const columnsOf = (db, table) =>
  db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)

/**
 * Rebuild the players table into the current shape, keeping ids, ratings and
 * history. Needed for two legacy generations: the original scaffold, which
 * named players by `handle`, and the email era, whose inline
 * `email TEXT UNIQUE` blocks a plain ALTER TABLE DROP COLUMN. A phone column
 * is carried across when the old table has one.
 */
function rebuildPlayers(db, reason, columns, log) {
  log?.warn?.(`rebuilding players table (${reason})`)
  const name = columns.includes('handle') ? 'handle' : 'display_name'
  const phone = columns.includes('phone') ? 'phone' : 'NULL'
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
    );
    INSERT INTO players_migrated
      (id, display_name, phone, rating, peak_rating, games, wins, losses, draws,
       lat, lng, located_at, last_seen_at, created_at)
    SELECT id, ${name}, ${phone}, rating, peak_rating, games, wins, losses, draws,
           lat, lng, located_at, last_seen_at, created_at
    FROM players;
    DROP TABLE players;
    ALTER TABLE players_migrated RENAME TO players;
  `)
}

export function up(db, log) {
  const players = columnsOf(db, 'players')
  if (players.includes('handle')) rebuildPlayers(db, 'handle era', players, log)
  else if (players.includes('email') || players.includes('password_hash')) {
    rebuildPlayers(db, 'email era', players, log)
  }

  // The original scaffold had an auth_codes table with a different shape; a
  // table without code_hash cannot serve the current statements.
  const authCodes = columnsOf(db, 'auth_codes')
  if (authCodes.length > 0 && !authCodes.includes('code_hash')) {
    db.exec('DROP TABLE auth_codes')
    log?.warn?.('dropped incompatible legacy auth_codes table')
  }

  // Tables that already exist keep their shape here; the steps below bring
  // older shapes up to date.
  db.exec(SCHEMA)

  if (!columnsOf(db, 'players').includes('phone')) {
    db.exec('ALTER TABLE players ADD COLUMN phone TEXT')
    log?.warn?.('added phone column to players')
  }
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_phone_unique ' +
    'ON players (phone) WHERE phone IS NOT NULL'
  )

  // Duel modes arrived after the first matches were played; old rows read as races.
  for (const table of ['challenges', 'matches']) {
    const columns = columnsOf(db, table)
    if (!columns.includes('mode')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN mode TEXT NOT NULL DEFAULT 'race'`)
      log?.warn?.(`added ${table}.mode`)
    }
    if (!columns.includes('duration_ms')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN duration_ms INTEGER`)
      log?.warn?.(`added ${table}.duration_ms`)
    }
  }
}
