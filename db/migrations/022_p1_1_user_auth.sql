BEGIN;

CREATE TABLE auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text NOT NULL,
  email_verified_at timestamptz,
  name text,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_users_email_normalized_eq CHECK (email_normalized = lower(btrim(email))),
  CONSTRAINT auth_users_email_normalized_unique UNIQUE (email_normalized)
);

CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type text NOT NULL,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_accounts_provider_account UNIQUE (provider, provider_account_id)
);

CREATE INDEX auth_accounts_user_id_idx ON auth_accounts (user_id);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_token_hash_format CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT auth_sessions_token_hash_unique UNIQUE (session_token_hash)
);

CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);

CREATE TABLE auth_verification_tokens (
  identifier_normalized text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identifier_normalized, token_hash),
  CONSTRAINT auth_verification_tokens_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX auth_verification_tokens_expires_at_idx ON auth_verification_tokens (expires_at);

CREATE TABLE auth_email_login_rate_limits (
  bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_email_login_rate_limits_updated_at_idx ON auth_email_login_rate_limits (updated_at);

COMMENT ON TABLE auth_users IS 'Stable general-user identities for later favorites and notifications. Separate from owner QA.';
COMMENT ON TABLE auth_email_login_rate_limits IS 'User magic-link throttling only. Never reuse owner_qa_login_rate_limits.';
COMMENT ON TABLE auth_accounts IS 'OAuth/email provider links. ON DELETE CASCADE from auth_users.';
COMMENT ON TABLE auth_sessions IS 'Opaque user session token hashes. ON DELETE CASCADE from auth_users.';
COMMENT ON TABLE auth_verification_tokens IS 'Hashed single-use magic-link tokens keyed by normalized email, not user id.';

COMMIT;
