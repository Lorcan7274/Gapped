-- How someone proves who they are belongs to the auth module, not the game.
-- A player is linked to one or more identities — a phone number today, an
-- OAuth subject later — so a new sign-in provider adds rows here instead of
-- columns to players. Game tables never hold a credential.

CREATE TABLE auth_identities (
  -- 'phone' for texted-code sign-in; the subject is the E.164 number.
  provider    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  player_id   TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);

CREATE INDEX idx_auth_identities_player ON auth_identities (player_id);

INSERT INTO auth_identities (provider, subject, player_id, created_at)
SELECT 'phone', phone, id, created_at FROM players WHERE phone IS NOT NULL;

DROP INDEX IF EXISTS idx_players_phone_unique;
ALTER TABLE players DROP COLUMN phone;
