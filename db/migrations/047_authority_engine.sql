BEGIN;
CREATE TABLE IF NOT EXISTS authority_prospects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain text NOT NULL UNIQUE CHECK(length(domain)<=253),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), category text NOT NULL,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','RESEARCHED','READY_TO_CONTACT','CONTACTED','FOLLOW_UP','INTERESTED','LINK_LIVE','DECLINED','NO_RESPONSE','REJECTED')),
 priority text NOT NULL CHECK(priority IN ('HIGH','MEDIUM','LOW','REJECT')),
 research jsonb NOT NULL DEFAULT '{}' CHECK(pg_column_size(research)<=16384),
 contact_url text, email text, target_url text NOT NULL, angle text NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), last_contact_at timestamptz, follow_up_on date,
 is_qa boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authority_prospects_queue ON authority_prospects(status,priority,updated_at DESC);
CREATE INDEX IF NOT EXISTS authority_prospects_followup ON authority_prospects(follow_up_on) WHERE follow_up_on IS NOT NULL;
CREATE TABLE IF NOT EXISTS authority_outreach_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prospect_id uuid NOT NULL REFERENCES authority_prospects(id),
 kind text NOT NULL, from_status text, to_status text, note text NOT NULL DEFAULT '', actor text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS authority_events_history ON authority_outreach_events(prospect_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS authority_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prospect_id uuid NOT NULL REFERENCES authority_prospects(id),
 source_url text NOT NULL CHECK(length(source_url)<=2000), target_url text NOT NULL CHECK(length(target_url)<=2000),
 state text NOT NULL DEFAULT 'UNKNOWN' CHECK(state IN ('LIVE','REMOVED','REDIRECTED','UNKNOWN')),
 anchor text, rel text, http_status integer, first_seen_at timestamptz, last_checked_at timestamptz,
 recorded_at timestamptz NOT NULL DEFAULT now(), is_qa boolean NOT NULL DEFAULT false,
 UNIQUE(source_url,target_url)
);
CREATE INDEX IF NOT EXISTS authority_links_due ON authority_links(last_checked_at,state);
CREATE INDEX IF NOT EXISTS authority_links_first_seen ON authority_links(first_seen_at);
CREATE TABLE IF NOT EXISTS authority_link_checks (
 id bigserial PRIMARY KEY, link_id uuid NOT NULL REFERENCES authority_links(id), checked_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL CHECK(state IN ('LIVE','REMOVED','REDIRECTED','UNKNOWN')), http_status integer,
 anchor text, rel text, reason text NOT NULL, request_count integer NOT NULL, target_http_status integer,
 UNIQUE(link_id,checked_at)
);
CREATE TABLE IF NOT EXISTS authority_monitor_runs (
 day date PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 state text NOT NULL CHECK(state IN ('RUNNING','SUCCEEDED','FAILED')), links_checked integer NOT NULL DEFAULT 0,
 requests integer NOT NULL DEFAULT 0, error_code text, asset_checks jsonb NOT NULL DEFAULT '[]'
);
COMMIT;
