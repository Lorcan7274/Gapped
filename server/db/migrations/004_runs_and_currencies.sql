-- Phase 2 of the async rework: runs are recorded and pay out; the public
-- rating, location and stranger-duel history go.

-- The hidden rating and the visible ladder. Existing phone accounts keep
-- their old rating as a provisional starting point, and their old rating
-- tier as their ladder tier.
ALTER TABLE players ADD COLUMN mmr REAL NOT NULL DEFAULT 1000;
ALTER TABLE players ADD COLUMN mmr_results INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN ladder_tier TEXT NOT NULL DEFAULT 'bronze';
ALTER TABLE players ADD COLUMN ladder_division INTEGER NOT NULL DEFAULT 1;

-- Currencies and running totals. Shards only ever grow; Fuel is a balance.
ALTER TABLE players ADD COLUMN shards INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN fuel INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN streak_last_day TEXT;
ALTER TABLE players ADD COLUMN lifetime_m REAL NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN runs INTEGER NOT NULL DEFAULT 0;

UPDATE players SET
  mmr = MIN(3000, MAX(0, rating)),
  ladder_tier = CASE
    WHEN rating >= 1700 THEN 'diamond'
    WHEN rating >= 1550 THEN 'amethyst'
    WHEN rating >= 1400 THEN 'sapphire'
    WHEN rating >= 1250 THEN 'gold'
    WHEN rating >= 1100 THEN 'silver'
    ELSE 'bronze'
  END;

DROP INDEX IF EXISTS idx_players_rating;
DROP INDEX IF EXISTS idx_players_location;
ALTER TABLE players DROP COLUMN rating;
ALTER TABLE players DROP COLUMN peak_rating;
ALTER TABLE players DROP COLUMN games;
ALTER TABLE players DROP COLUMN wins;
ALTER TABLE players DROP COLUMN losses;
ALTER TABLE players DROP COLUMN draws;
ALTER TABLE players DROP COLUMN lat;
ALTER TABLE players DROP COLUMN lng;
ALTER TABLE players DROP COLUMN located_at;

-- Stranger duels are gone, and so is their history. Live duels survive as a
-- friends-only social feature that moves no points and no rating.
DROP TABLE matches;
DROP TABLE challenges;

CREATE TABLE live_challenges (
  id            TEXT PRIMARY KEY,
  from_id       TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  to_id         TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- 'race' is first to distance_m; 'timed' is most metres inside duration_ms.
  mode          TEXT NOT NULL DEFAULT 'race',
  distance_m    INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  responded_at  INTEGER
);
CREATE INDEX idx_live_challenges_to   ON live_challenges (to_id, status);
CREATE INDEX idx_live_challenges_from ON live_challenges (from_id, status);

CREATE TABLE live_duels (
  id            TEXT PRIMARY KEY,
  challenge_id  TEXT REFERENCES live_challenges (id) ON DELETE SET NULL,
  a_id          TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  b_id          TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  mode          TEXT NOT NULL DEFAULT 'race',
  distance_m    INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  status        TEXT NOT NULL DEFAULT 'live',
  winner_id     TEXT REFERENCES players (id) ON DELETE SET NULL,
  a_progress_m  REAL NOT NULL DEFAULT 0,
  b_progress_m  REAL NOT NULL DEFAULT 0,
  a_elapsed_ms  INTEGER,
  b_elapsed_ms  INTEGER,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX idx_live_duels_a      ON live_duels (a_id, started_at DESC);
CREATE INDEX idx_live_duels_b      ON live_duels (b_id, started_at DESC);
CREATE INDEX idx_live_duels_status ON live_duels (status);

-- Every run a player records. Solo today; duel legs, live duels, imports and
-- house ghosts share the table as they arrive.
CREATE TABLE runs (
  id           TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'solo',
  -- A private run pays the same but never appears in a feed or as a ghost.
  private      INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER NOT NULL,
  -- Calendar day and week (named by its Monday) in the game's time zone.
  day          TEXT NOT NULL,
  week         TEXT NOT NULL,
  distance_m   REAL NOT NULL,
  elapsed_ms   INTEGER NOT NULL,
  -- 'ok'; 'quarantined' (flagged: settles unranked, pays nothing, awaits review).
  status       TEXT NOT NULL DEFAULT 'ok',
  flags        TEXT,
  intensity    REAL NOT NULL DEFAULT 0,
  shards       INTEGER NOT NULL DEFAULT 0,
  fuel         INTEGER NOT NULL DEFAULT 0,
  points       INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_runs_player ON runs (player_id, started_at DESC);
CREATE INDEX idx_runs_day    ON runs (player_id, day);
CREATE INDEX idx_runs_feed   ON runs (week, private, status);
-- The phone retries uploads; the same run twice is one run.
CREATE UNIQUE INDEX idx_runs_once ON runs (player_id, started_at);

-- The raw fixes behind a run, for ghost replay and review (lib/track.js format).
CREATE TABLE run_tracks (
  run_id     TEXT PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
  format     INTEGER NOT NULL,
  samples    INTEGER NOT NULL,
  has_steps  INTEGER NOT NULL DEFAULT 0,
  data       TEXT NOT NULL
);

-- Ledgers: every point and every unit of Fuel that moves, so balances can be
-- audited and weeks settled by replaying them.
CREATE TABLE point_events (
  id          TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  week        TEXT NOT NULL,
  source      TEXT NOT NULL,
  ref_id      TEXT,
  points      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_point_events_week ON point_events (week, player_id);

CREATE TABLE fuel_events (
  id          TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  ref_id      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_fuel_events_player ON fuel_events (player_id, created_at DESC);
