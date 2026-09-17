BEGIN;

-- P2 SEO: the player sitemap eligibility (statistics, lineups or fixture statistics) scans
-- fixture_lineups and fixture_player_statistics by player. Both tables only had fixture-first
-- indexes. Additive, idempotent; no data changes. Measured cold cost before: 10–44 s per request.
CREATE INDEX IF NOT EXISTS fixture_lineups_player_entity_idx ON fixture_lineups (player_entity_id) WHERE player_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fixture_player_statistics_player_idx ON fixture_player_statistics (player_id);

COMMIT;
