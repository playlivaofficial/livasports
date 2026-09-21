BEGIN;
CREATE TABLE IF NOT EXISTS odds_team_aliases (
  provider text NOT NULL CHECK (provider='ODDSPAPI'),
  competition_id uuid NOT NULL REFERENCES competitions(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  normalized_name text NOT NULL CHECK (length(normalized_name)>0),
  evidence jsonb NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,competition_id,normalized_name,team_id)
);
CREATE TABLE IF NOT EXISTS odds_native_diagnostics (
  snapshot_id text NOT NULL REFERENCES odds_sync_snapshots(id),
  bookmaker text NOT NULL,
  provider_fixture_id text NOT NULL,
  market text NOT NULL,
  outcome text NOT NULL DEFAULT '',
  fixture_id uuid REFERENCES fixtures(id),
  classification text NOT NULL CHECK(classification IN ('NATIVE_PERSISTED','PROVIDER_GAP','INGESTION_BUG','IDENTITY_UNRESOLVED','MARKET_MAPPING_FAILURE','STALE_OR_EXPIRED','SUSPENDED_OR_REMOVED','QUOTA_OR_BACKOFF_DELAY','UNKNOWN_PIPELINE_DEFECT','OUT_OF_SCOPE')),
  evidence jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY(snapshot_id,bookmaker,provider_fixture_id,market,outcome)
);
CREATE INDEX IF NOT EXISTS odds_native_diagnostics_fixture ON odds_native_diagnostics(fixture_id,bookmaker,observed_at DESC);
CREATE INDEX IF NOT EXISTS odds_native_diagnostics_reason ON odds_native_diagnostics(classification,observed_at DESC);
CREATE TABLE IF NOT EXISTS odds_native_rollups (
  bucket timestamptz PRIMARY KEY,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
