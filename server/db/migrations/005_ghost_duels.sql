-- Ghost duels (phase 3). A duel has two legs: the challenger races a
-- recording of one of the target's runs, then the target races the
-- challenger's run back. Sunday night settles whatever is left.

-- How long a run took to cover its own distance, timed from its first
-- accepted GPS fix to the fix that reached its final distance — the time a
-- ghost of it runs. Null for runs recorded before this column; computed from
-- the track when first needed.
ALTER TABLE runs ADD COLUMN ghost_ms INTEGER;

CREATE TABLE duels (
  id              TEXT PRIMARY KEY,
  -- The week (named by its Monday) whose Sunday night settles the duel, and
  -- whose table its points land in.
  week            TEXT NOT NULL,
  -- 'leg1'     the challenger is racing the ghost
  -- 'awaiting' leg one is in; the target has until Sunday to reply
  -- 'leg2'     the target is racing the challenger's run back
  -- 'settled'  decided (see outcome); 'void' — a leg was flagged, nothing moves
  status          TEXT NOT NULL,
  challenger_id   TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  target_id       TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- The target's run the challenger races, and the distance and time of it.
  ghost_run_id    TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  distance_m      REAL NOT NULL,
  ghost_ms        INTEGER NOT NULL,
  fuel_cost       INTEGER NOT NULL,
  leg1_started_at INTEGER NOT NULL,
  leg1_run_id     TEXT REFERENCES runs (id) ON DELETE SET NULL,
  leg1_ms         INTEGER,
  leg1_quit       INTEGER NOT NULL DEFAULT 0,
  leg2_started_at INTEGER,
  leg2_run_id     TEXT REFERENCES runs (id) ON DELETE SET NULL,
  leg2_ms         INTEGER,
  leg2_quit       INTEGER NOT NULL DEFAULT 0,
  -- 'challenger' | 'target' | 'tie' | 'walkover' | 'withdrawn' | 'void'
  outcome         TEXT,
  -- Combined margin in ms, from the challenger's side (positive: challenger ahead).
  margin_ms       INTEGER,
  challenger_points INTEGER,
  target_points     INTEGER,
  -- Hidden-rating movement, kept for audit and the simulator. Never serialised.
  challenger_mmr_delta REAL,
  target_mmr_delta     REAL,
  created_at      INTEGER NOT NULL,
  settled_at      INTEGER
);
CREATE INDEX idx_duels_challenger ON duels (challenger_id, created_at DESC);
CREATE INDEX idx_duels_target     ON duels (target_id, created_at DESC);
CREATE INDEX idx_duels_open       ON duels (status, week);
