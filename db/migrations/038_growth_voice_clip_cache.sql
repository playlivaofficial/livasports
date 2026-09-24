BEGIN;

-- Natural Voice V1: durable narration cache. Additive only; nothing existing is altered.
-- A clip is keyed by a SHA-256 of everything that changes the produced audio (provider, voice, model,
-- settings, spoken text, neighbouring lines and seed), so an unchanged line is never paid for twice —
-- across platforms, retries, regenerations and visual-only re-renders. No credential is ever stored.
CREATE TABLE IF NOT EXISTS growth_voice_clips (
  cache_key char(64) PRIMARY KEY CHECK(cache_key ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL CHECK(length(provider)<=40),
  voice_id text NOT NULL CHECK(length(voice_id)<=64),
  model text NOT NULL CHECK(length(model)<=64),
  voice_mode text NOT NULL CHECK(voice_mode IN ('ENERGETIC','EDITORIAL')),
  spoken_text text NOT NULL CHECK(length(spoken_text)<=600),
  characters integer NOT NULL CHECK(characters>=0),
  mime_type text NOT NULL CHECK(mime_type='audio/mpeg'),
  sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer NOT NULL CHECK(byte_length>0 AND byte_length<=2000000),
  audio_data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  use_count integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS growth_voice_clips_last_used ON growth_voice_clips(last_used_at);

COMMIT;
