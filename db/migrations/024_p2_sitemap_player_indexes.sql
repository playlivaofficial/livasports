BEGIN;

-- P2 SEO: the player sitemap eligibility (statistics, lineups or fixture statistics) scans
-- fixture_lineups by player; the table only had fixture-first indexes. Additive, idempotent,
-- no data changes. 1.28M rows / 231 MB measured in production on 2026-09-17: a plain build
-- completes in seconds inside the migration runner's single-query transaction.
CREATE INDEX IF NOT EXISTS fixture_lineups_player_entity_idx ON fixture_lineups (player_entity_id) WHERE player_entity_id IS NOT NULL;

-- Deliberately NOT included: an index on fixture_player_statistics (player_id). That table holds
-- ~15M rows / 2.5 GB and is written by live ingestion; a non-concurrent build would hold a SHARE
-- lock for minutes, and the runner executes each file as one transaction so CONCURRENTLY is not
-- available. Its primary key (fixture_id, player_id, provider_type_id) already serves an
-- index-only scan of player_id. If ever needed, build it out-of-band with CREATE INDEX CONCURRENTLY.

COMMIT;
