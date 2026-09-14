BEGIN;

-- A provider lineup can contain real statistics before a global player identity is available.
-- Retain them against the official lineup record; never fabricate a player mapping.
ALTER TABLE fixture_lineups ADD COLUMN unlinked_statistics jsonb
  CHECK (unlinked_statistics IS NULL OR jsonb_typeof(unlinked_statistics)='array');

COMMIT;
