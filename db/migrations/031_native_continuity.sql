BEGIN;
CREATE TABLE IF NOT EXISTS odds_target_support (
 provider text NOT NULL,bookmaker text NOT NULL,tournament_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('SUPPORTED','UNSUPPORTED','REVIEW_REQUIRED')),
 reason text NOT NULL,evidence jsonb NOT NULL,verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,bookmaker,tournament_id)
);
CREATE TABLE IF NOT EXISTS odds_continuity_samples (
 bucket timestamptz PRIMARY KEY,observed_at timestamptz NOT NULL,cells jsonb NOT NULL,
 CONSTRAINT odds_continuity_cells_array CHECK(jsonb_typeof(cells)='array')
);
CREATE TABLE IF NOT EXISTS odds_scheduler_decisions (
 job_id uuid PRIMARY KEY REFERENCES odds_sync_jobs(id),at timestamptz NOT NULL DEFAULT now(),
 targets jsonb NOT NULL,budget jsonb NOT NULL
);
COMMIT;
