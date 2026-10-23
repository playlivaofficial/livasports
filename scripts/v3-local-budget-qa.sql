\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE i integer; blocked boolean := false;
BEGIN
 IF current_database()<>'livasports_v3_qa' OR current_setting('port')<>'55475' THEN RAISE EXCEPTION 'LOCAL_DATABASE_REQUIRED'; END IF;
 IF (SELECT count(*) FROM editorial_automation_runs)<>0 THEN RAISE EXCEPTION 'TEST_REQUIRES_EMPTY_NEW_EPOCH'; END IF;
 FOR i IN 1..46 LOOP
  INSERT INTO editorial_automation_runs(id,started_at,lease_until,status,model_microusd_reserved)
  VALUES(gen_random_uuid(),now(),now(),'abandoned',20000);
 END LOOP;
 BEGIN
  INSERT INTO editorial_automation_runs(id,started_at,lease_until,status,model_microusd_reserved)
  VALUES(gen_random_uuid(),now(),now(),'abandoned',20000);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'LOCAL_EPOCH_LIFETIME_BUDGET' THEN RAISE; END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'BUDGET_NOT_ENFORCED'; END IF;
 RAISE NOTICE 'PASS: 920000 new reservations allowed; next reservation rejected; historical 80000 remains unavailable';
END $$;
ROLLBACK;
SELECT epoch,historical_reserved_microusd,historical_reported_microusd FROM local_validation_epoch;
SELECT count(*) AS actual_new_epoch_runs FROM editorial_automation_runs;
