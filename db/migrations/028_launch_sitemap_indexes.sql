-- livasports:concurrent-indexes
-- Each statement must run outside a transaction block, using the migration runner's concurrent-index path.
-- Additive only: preserves all eligibility, IDs and sports records, without blocking normal writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS player_statistics_latest_idx ON player_season_statistics(player_id,observed_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS fixture_lineups_player_latest_idx ON fixture_lineups(player_entity_id,observed_at DESC) WHERE player_entity_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS fixture_player_statistics_latest_idx ON fixture_player_statistics(player_id,observed_at DESC);
