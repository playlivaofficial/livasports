BEGIN;

-- Short-lived abuse counters, isolated from users/owner authentication and analytics.
-- Only keyed HMACs are persisted. Never store raw IP addresses or user input.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket_hash text PRIMARY KEY CHECK(bucket_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS request_rate_limits_expiry ON request_rate_limits(expires_at);

-- Internal alert drills are isolated from real incidents and all user/commercial analytics.
CREATE TABLE IF NOT EXISTS owner_alert_tests (
  run_id uuid NOT NULL,
  phase text NOT NULL CHECK(phase IN ('OPENED','RESOLVED')),
  status text NOT NULL CHECK(status IN ('PENDING','SENT','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY(run_id,phase)
);
CREATE INDEX IF NOT EXISTS owner_alert_tests_created ON owner_alert_tests(created_at);
CREATE TABLE IF NOT EXISTS launch_maintenance_runs (
  name text PRIMARY KEY,
  last_started_at timestamptz NOT NULL,
  last_completed_at timestamptz,
  result jsonb
);
CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen ON analytics_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS auth_email_login_rate_limits_updated ON auth_email_login_rate_limits(updated_at);

COMMIT;
