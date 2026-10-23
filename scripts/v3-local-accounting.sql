-- LOCAL ONLY recovery epoch; historical evidence is NOT fabricated run transactions.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'livasports_v3_qa' OR current_setting('port')<>'55475' THEN RAISE EXCEPTION 'LOCAL_DATABASE_REQUIRED'; END IF;
END $$;
CREATE TABLE local_validation_epoch (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 epoch text NOT NULL UNIQUE,
 historical_reserved_microusd integer NOT NULL CHECK(historical_reserved_microusd=80000),
 historical_reported_microusd integer NOT NULL CHECK(historical_reported_microusd=3950),
 lifetime_authorization_microusd integer NOT NULL CHECK(lifetime_authorization_microusd=1000000),
 evidence_status text NOT NULL CHECK(evidence_status='reported-evidence-not-recovered-transactions'),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO local_validation_epoch VALUES(true,'local-rebuild-2026-10-22',80000,3950,1000000,'reported-evidence-not-recovered-transactions',now());
CREATE FUNCTION local_validation_budget_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reserved bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(724222);
 SELECT coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0) INTO reserved FROM editorial_automation_runs;
 IF reserved+greatest(NEW.model_microusd_reserved,NEW.model_microusd_used)+80000>1000000 THEN RAISE EXCEPTION 'LOCAL_EPOCH_LIFETIME_BUDGET'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER local_validation_budget BEFORE INSERT ON editorial_automation_runs FOR EACH ROW EXECUTE FUNCTION local_validation_budget_guard();
UPDATE editorial_automation_control SET paused=true;
INSERT INTO editorial_automation_audit(action,detail) VALUES('local-accounting-epoch', '{"epoch":"local-rebuild-2026-10-22","historicalReservationsMicroUsd":80000,"historicalReportedMicroUsd":3950,"recoveredTransactions":false}');
COMMIT;
