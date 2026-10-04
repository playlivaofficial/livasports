BEGIN;
-- Rolling-release safe: old workers keep their fixture-only/cluster-only conflict keys.
-- Historical BR tables are neither rewritten nor copied; only new core GEOs write below.
CREATE TABLE IF NOT EXISTS seo_geo_pages (
 fixture_id uuid NOT NULL REFERENCES fixtures(id), url text NOT NULL UNIQUE,
 locale text NOT NULL CHECK(locale IN('mx','co','pe')),
 score double precision NOT NULL CHECK(score BETWEEN 0 AND 100), tier text NOT NULL CHECK(tier IN('A','B','C')),
 state text NOT NULL CHECK(state IN('PUBLISHED','BLOCKED','PRODUCT_ONLY','NOINDEX','RETRYABLE_DATA_GAP')),
 evidence jsonb NOT NULL, reasons jsonb NOT NULL, links jsonb NOT NULL DEFAULT '[]',
 content_hash text NOT NULL, content_changed_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, checked_at timestamptz NOT NULL DEFAULT now(), retain_indexable boolean NOT NULL DEFAULT false,
 title text, description text, metadata_changed_at timestamptz, config_version text NOT NULL,
 link_boost integer NOT NULL DEFAULT 0 CHECK(link_boost BETWEEN 0 AND 5), link_boost_until timestamptz,
 intent_focus text CHECK(intent_focus IN('H2H','FORM','STANDINGS','SCHEDULE','GENERAL')), optimization_metadata jsonb,
 PRIMARY KEY(fixture_id,locale),
 CHECK(url LIKE 'https://livasports.com/' || locale || '/partido/%')
);
CREATE INDEX IF NOT EXISTS seo_geo_pages_locale_priority ON seo_geo_pages(locale,state,score DESC);
CREATE TABLE IF NOT EXISTS seo_geo_clusters (
 locale text NOT NULL CHECK(locale IN('mx','co','pe')), cluster text NOT NULL,
 boost integer NOT NULL CHECK(boost BETWEEN 0 AND 5), evidence jsonb NOT NULL,
 evaluated_week date NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(locale,cluster)
);
CREATE TABLE IF NOT EXISTS seo_geo_cluster_weights (
 locale text NOT NULL CHECK(locale IN('mx','co','pe')), cluster text NOT NULL,
 adjustment integer NOT NULL CHECK(adjustment BETWEEN -3 AND 3), evidence jsonb NOT NULL,
 evaluated_week date NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(locale,cluster)
);
-- UNION views are read-only: retain legacy public content/metadata/sitemap state without
-- giving the new optimizer a write path to BR or altering old production schemas.
CREATE OR REPLACE VIEW seo_all_pages AS
 SELECT fixture_id,url,locale,score,tier,state,evidence,reasons,links,content_hash,content_changed_at,
 published_at,checked_at,retain_indexable,title,description,metadata_changed_at,config_version,
 link_boost,link_boost_until,intent_focus,optimization_metadata FROM seo_autopilot_pages
 UNION ALL
 SELECT fixture_id,url,locale,score,tier,state,evidence,reasons,links,content_hash,content_changed_at,
 published_at,checked_at,retain_indexable,title,description,metadata_changed_at,config_version,
 link_boost,link_boost_until,intent_focus,optimization_metadata FROM seo_geo_pages;
CREATE OR REPLACE VIEW seo_all_clusters AS
 SELECT 'br'::text AS locale,cluster,boost,evidence,evaluated_week,updated_at FROM seo_autopilot_clusters
 UNION ALL SELECT locale,cluster,boost,evidence,evaluated_week,updated_at FROM seo_geo_clusters;
CREATE OR REPLACE VIEW seo_all_cluster_weights AS
 SELECT 'br'::text AS locale,cluster,adjustment,evidence,evaluated_week,updated_at FROM seo_growth_cluster_weights
 UNION ALL SELECT locale,cluster,adjustment,evidence,evaluated_week,updated_at FROM seo_geo_cluster_weights;
-- Expanding the independent immutable CTR registry's allowlist remains compatible with
-- older br/mx/en writers. Its unique keys and all registered experiment history stay intact.
ALTER TABLE seo_metadata_experiments DROP CONSTRAINT IF EXISTS seo_metadata_experiments_locale_check;
ALTER TABLE seo_metadata_experiments ADD CONSTRAINT seo_metadata_experiments_locale_check CHECK(locale IN('br','mx','co','pe','en'));
COMMIT;
