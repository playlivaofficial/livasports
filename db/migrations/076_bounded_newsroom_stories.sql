BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Only widens a per-run reservation constraint. No data is rewritten or removed.
-- Two stories still reserve $0.02 each; daily $0.10 / monthly $3 gates remain transactional.
-- Older application versions continue to create $0.02 single-story runs after rollback.
ALTER TABLE editorial_automation_runs DROP CONSTRAINT IF EXISTS editorial_automation_runs_model_microusd_reserved_check;
ALTER TABLE editorial_automation_runs ADD CONSTRAINT editorial_automation_runs_model_microusd_reserved_check CHECK (model_microusd_reserved BETWEEN 0 AND 40000);
COMMIT;
