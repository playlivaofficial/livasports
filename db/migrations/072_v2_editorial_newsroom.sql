BEGIN;
-- Additive only. Existing user, sports, affiliate and analytics records are untouched.
CREATE TABLE IF NOT EXISTS editorial_news (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=100),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft)='object'),
  published jsonb CHECK (published IS NULL OR jsonb_typeof(published)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  reviewed_revision integer,
  reviewed_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reviewed_revision IS NULL OR reviewed_revision<=revision)
);
CREATE INDEX IF NOT EXISTS editorial_news_public_date ON editorial_news ((published->>'sourcePublishedOn') DESC,slug) WHERE published IS NOT NULL AND NOT archived;
CREATE TABLE IF NOT EXISTS editorial_news_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL REFERENCES editorial_news(slug),
  action text NOT NULL CHECK (action IN ('create','save','review','publish','archive')),
  revision integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS editorial_news_audit_story ON editorial_news_audit(slug,recorded_at DESC);
COMMIT;
