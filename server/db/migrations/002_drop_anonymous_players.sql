-- Accounts without a verified phone number could only ever be reached with
-- their bare player id, and that path is gone: anyone who could read an id
-- could take over the account. Nothing can sign into these accounts any
-- more, so they are deleted along with everything that points at them.
-- Foreign keys are off while migrations run, so the dependants go first,
-- explicitly.

DELETE FROM sessions
WHERE player_id IN (SELECT id FROM players WHERE phone IS NULL);

DELETE FROM matches
WHERE a_id IN (SELECT id FROM players WHERE phone IS NULL)
   OR b_id IN (SELECT id FROM players WHERE phone IS NULL)
   OR challenge_id IN (
     SELECT id FROM challenges
     WHERE from_id IN (SELECT id FROM players WHERE phone IS NULL)
        OR to_id IN (SELECT id FROM players WHERE phone IS NULL)
   );

DELETE FROM challenges
WHERE from_id IN (SELECT id FROM players WHERE phone IS NULL)
   OR to_id IN (SELECT id FROM players WHERE phone IS NULL);

-- A settled match can name a winner who is being deleted only if the match
-- itself involved them, and those matches are already gone above.
DELETE FROM players WHERE phone IS NULL;
