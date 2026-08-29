PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- A player is created by joining with a display name. There is no password
-- and no verification step: the id returned at join is the credential, and
-- the client keeps it in localStorage.
CREATE TABLE IF NOT EXISTS players (
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  -- Null for accounts created before sign-in existed. Those keep working
  -- until someone attaches credentials to them.
  email             TEXT UNIQUE,
  password_hash     TEXT,
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
CREATE INDEX IF NOT EXISTS idx_players_email    ON players (email);
CREATE INDEX IF NOT EXISTS idx_players_location ON players (lat, lng);

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
  distance_m    INTEGER NOT NULL,
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
  distance_m      INTEGER NOT NULL,
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
