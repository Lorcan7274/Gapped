PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- A player is a display name plus a verified phone number. The number is
-- the credential: prove you hold it with a texted code and you are that
-- player, on any device.
CREATE TABLE IF NOT EXISTS players (
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  -- E.164. Null for accounts created before phone sign-in existed; those
  -- keep working on their stored id until a number is attached. Uniqueness
  -- comes from idx_players_phone_unique, created in the migration path so
  -- old databases converge on it too (an inline UNIQUE cannot be added to
  -- an existing table).
  phone             TEXT,
  rating            INTEGER NOT NULL DEFAULT 1000,
  peak_rating       INTEGER NOT NULL DEFAULT 1000,
  games             INTEGER NOT NULL DEFAULT 0,
  wins              INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  draws             INTEGER NOT NULL DEFAULT 0,
  -- Null until the browser grants location. Denial must never block a join.
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
