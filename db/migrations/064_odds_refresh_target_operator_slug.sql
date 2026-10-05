BEGIN;

-- P0: the MX/CO/PE activation made the scheduler fail on every tick.
--
-- odds_refresh_targets_bookmaker_check still enumerated the Brazilian line-up
-- ('betano.bet.br','betsson','sportingbet.bet.br','betboo.bet.br','1xbet'). Once migration 063
-- verified the MX/CO/PE operator feeds, schedulerPlan began planning batches for bwin and inkabet,
-- reconcileRefreshQueue inserted their refresh targets, and the CHECK rejected the write. The
-- exception escaped before endOddsJob ran, so each job stayed RUNNING until the next tick reaped it
-- as LEASE_EXPIRED: no bookmaker request was ever reserved and MX/CO/PE odds could not flow.
--
-- Enumerating operators here duplicates the registry and guarantees the same outage every time an
-- operator is added, so this becomes a slug-shape constraint instead — the same rule
-- analytics_events already uses. It still rejects malformed identifiers, and every existing row
-- satisfies it. Which operators are actually requested stays governed by ACTIVE_BOOKMAKER_IDS and
-- the verified operator feeds, which is where that decision belongs.
ALTER TABLE odds_refresh_targets DROP CONSTRAINT IF EXISTS odds_refresh_targets_bookmaker_check;
ALTER TABLE odds_refresh_targets ADD CONSTRAINT odds_refresh_targets_bookmaker_check
  CHECK (bookmaker ~ '^[a-z0-9][a-z0-9.-]{0,63}$');

-- Release the job stranded by the final failing tick so the next cron run starts cleanly instead of
-- waiting for its lease to lapse.
UPDATE odds_sync_jobs SET status='INTERRUPTED',completed_at=now(),error_code='REFRESH_TARGET_CONSTRAINT'
 WHERE status='RUNNING';

COMMIT;
