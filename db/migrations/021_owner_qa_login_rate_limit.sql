CREATE TABLE IF NOT EXISTS owner_qa_login_rate_limits (
  bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  failed_count integer NOT NULL CHECK (failed_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_qa_login_rate_limits_updated_at_idx
  ON owner_qa_login_rate_limits (updated_at);

COMMENT ON TABLE owner_qa_login_rate_limits IS
  'Pseudonymous failed-login throttling only; never authorizes or binds an owner session.';
