BEGIN;
-- Private, short-lived diagnostic drafts. Never joined by public article queries.
CREATE TABLE IF NOT EXISTS editorial_generation_evidence (
 run_id uuid NOT NULL REFERENCES editorial_automation_runs(id),
 event_key text NOT NULL REFERENCES editorial_automation_events(event_key),
 checkpoint integer NOT NULL CHECK(checkpoint BETWEEN 0 AND 12),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=96000),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 PRIMARY KEY(run_id,event_key,checkpoint),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '7 days')
);
CREATE INDEX IF NOT EXISTS editorial_generation_evidence_expiry ON editorial_generation_evidence(expires_at);
REVOKE ALL ON editorial_generation_evidence FROM PUBLIC;
COMMIT;
