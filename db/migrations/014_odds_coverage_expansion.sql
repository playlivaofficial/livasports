BEGIN;

ALTER TABLE odds_refresh_targets DROP CONSTRAINT IF EXISTS odds_refresh_targets_tournament_id_check;
ALTER TABLE odds_refresh_targets ADD CONSTRAINT odds_refresh_targets_tournament_id_check
  CHECK (tournament_id ~ '^[0-9]{1,10}$');

COMMIT;
