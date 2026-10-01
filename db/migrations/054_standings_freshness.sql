BEGIN;
CREATE TABLE IF NOT EXISTS standings_refresh_state (
  season_id uuid PRIMARY KEY REFERENCES seasons(id),
  competition_id uuid NOT NULL REFERENCES competitions(id),
  dirty_version bigint NOT NULL DEFAULT 1,
  refreshed_version bigint NOT NULL DEFAULT 0,
  dirty_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  provider_updated_at timestamptz,
  fetched_at timestamptz,
  persisted_at timestamptz,
  snapshot_hash text,
  snapshot_version bigint NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  last_error text,
  snapshot_metrics jsonb NOT NULL DEFAULT '{}',
  CHECK (failures >= 0 AND row_count >= 0)
);
CREATE INDEX IF NOT EXISTS standings_refresh_due_idx ON standings_refresh_state(next_attempt_at);
CREATE TABLE IF NOT EXISTS standings_refresh_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES seasons(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'RUNNING',
  error_code text
);
CREATE INDEX IF NOT EXISTS standings_refresh_attempt_time_idx ON standings_refresh_attempts(started_at DESC);

-- Every existing result writer participates without calling a provider in its transaction.
CREATE OR REPLACE FUNCTION mark_standings_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected uuid;
BEGIN
  IF TG_OP='UPDATE' AND ROW(OLD.status,OLD.home_score,OLD.away_score,OLD.season_id,OLD.competition_id,OLD.home_team_id,OLD.away_team_id,OLD.provider_stage_id,OLD.provider_group_id)
    IS NOT DISTINCT FROM ROW(NEW.status,NEW.home_score,NEW.away_score,NEW.season_id,NEW.competition_id,NEW.home_team_id,NEW.away_team_id,NEW.provider_stage_id,NEW.provider_group_id) THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'FINISHED' THEN RETURN NEW; END IF;
  ELSIF OLD.status<>'FINISHED' AND NEW.status<>'FINISHED' THEN RETURN NEW;
  END IF;
  FOR affected IN SELECT DISTINCT id FROM unnest(CASE WHEN TG_OP='UPDATE' THEN ARRAY[OLD.season_id,NEW.season_id] ELSE ARRAY[NEW.season_id] END) id WHERE id IS NOT NULL LOOP
    INSERT INTO standings_refresh_state(season_id,competition_id,next_attempt_at)
      SELECT s.id,s.competition_id,now()+interval '5 minutes' FROM seasons s JOIN competitions c ON c.id=s.competition_id WHERE s.id=affected AND c.enabled
    ON CONFLICT(season_id) DO UPDATE SET dirty_version=standings_refresh_state.dirty_version+1,dirty_at=now(),
      next_attempt_at=CASE WHEN standings_refresh_state.failures>0 THEN standings_refresh_state.next_attempt_at ELSE LEAST(standings_refresh_state.next_attempt_at,now()+interval '5 minutes') END;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fixtures_standings_dirty ON fixtures;
CREATE TRIGGER fixtures_standings_dirty AFTER INSERT OR UPDATE ON fixtures FOR EACH ROW EXECUTE FUNCTION mark_standings_dirty();
-- Bootstrap queue only; no standings or sports records are rewritten by this migration.
INSERT INTO standings_refresh_state(season_id,competition_id)
 SELECT s.id,s.competition_id FROM seasons s JOIN competitions c ON c.id=s.competition_id WHERE c.enabled AND s.is_current
 ON CONFLICT DO NOTHING;
-- Protect pre-migration good tables too, rather than treating them as empty bootstrap state.
UPDATE standings_refresh_state q SET row_count=b.n,snapshot_metrics=COALESCE(b.metrics,'{}'::jsonb),
  fetched_at=b.observed,persisted_at=b.observed,last_success_at=b.observed,provider_updated_at=b.provider_time
FROM (SELECT sc.season_id,count(*)::int AS n,max(sc.observed_at) AS observed,max(sc.provider_updated_at) AS provider_time,
  jsonb_object_agg(sc.stage_id::text||':'||sc.group_id::text||':'||m.provider_entity_id,sc.played) FILTER(WHERE sc.played IS NOT NULL) AS metrics
  FROM standings_current sc JOIN provider_entity_mappings m ON m.livasports_entity_id=sc.team_id AND m.provider='SPORTMONKS' AND m.entity_type='TEAM'
  GROUP BY sc.season_id) b WHERE q.season_id=b.season_id AND q.fetched_at IS NULL;
UPDATE standings_refresh_state q SET row_count=u.n,fetched_at=u.observed,persisted_at=u.observed,last_success_at=u.observed
 FROM (SELECT season_id,count(*)::int AS n,max(observed_at) AS observed FROM sports_unlinked_competition_records WHERE capability='STANDINGS' GROUP BY season_id) u
 WHERE q.season_id=u.season_id AND q.fetched_at IS NULL;
COMMIT;
