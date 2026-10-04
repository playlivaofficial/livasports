BEGIN;

-- Historical BR rows remain auditable. Eligibility is per jurisdiction, not inferred from a feed name.
INSERT INTO countries(iso2,name) VALUES('CO','Colombia'),('PE','Peru') ON CONFLICT(iso2) DO NOTHING;
ALTER TABLE bookmaker_geo_availability DROP CONSTRAINT IF EXISTS bookmaker_geo_availability_verification_state_check;
ALTER TABLE bookmaker_geo_availability ADD CONSTRAINT bookmaker_geo_availability_verification_state_check
 CHECK(verification_state IN ('VERIFIED','VERIFIED_BR','VERIFIED_MX','VERIFIED_CO','VERIFIED_PE','VERIFIED_BR_MX','GENERIC_UNVERIFIED','NOT_ELIGIBLE'));
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS commercial_status text NOT NULL DEFAULT 'CANDIDATE'
 CHECK(commercial_status IN ('UNAVAILABLE','CANDIDATE','PENDING','APPROVED','ACTIVE','SUSPENDED'));
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS legal_status text NOT NULL DEFAULT 'UNVERIFIED'
 CHECK(legal_status IN ('UNVERIFIED','VERIFIED','RESTRICTED'));
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS legal_reference text;
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS legal_verified_at timestamptz;
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS sportsbook_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS public_priority integer NOT NULL DEFAULT 100 CHECK(public_priority BETWEEN 0 AND 10000);
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS source_domains text[] NOT NULL DEFAULT '{}';
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS destination_domains text[] NOT NULL DEFAULT '{}';
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS currency char(3);
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS commercial_version integer NOT NULL DEFAULT 0;
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS last_validated_at timestamptz;

CREATE TABLE IF NOT EXISTS operator_provider_mappings (
 bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),country_id uuid NOT NULL REFERENCES countries(id),
 provider text NOT NULL,provider_bookmaker_id text NOT NULL CHECK(length(provider_bookmaker_id) BETWEEN 1 AND 160),
 verified_at timestamptz,evidence jsonb NOT NULL DEFAULT '{}',
 PRIMARY KEY(bookmaker_id,country_id,provider,provider_bookmaker_id),
 FOREIGN KEY(bookmaker_id,country_id) REFERENCES bookmaker_geo_availability(bookmaker_id,country_id),
 UNIQUE(country_id,provider,provider_bookmaker_id)
);
CREATE TABLE IF NOT EXISTS operator_activation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
 country_id uuid NOT NULL REFERENCES countries(id),actor_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('ACTIVATE','SUSPEND','RECONFIGURE')),version integer NOT NULL,
 campaign_id uuid REFERENCES affiliate_campaigns(id),destination_hash text,
 approval_reference text,occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bookmaker_id,country_id,version)
);
ALTER TABLE affiliate_campaigns ADD COLUMN IF NOT EXISTS sub_id text CHECK(length(sub_id)<=160);
ALTER TABLE affiliate_campaigns ADD COLUMN IF NOT EXISTS offer_metadata jsonb NOT NULL DEFAULT '{}';

-- Candidate identity only. These IDs do not assert provider coverage, legal eligibility or approval.
INSERT INTO bookmakers(provider_slug,display_name,enabled,comparison_enabled,affiliate_status)
VALUES ('codere','Codere',true,false,'PENDING'),('caliente','Caliente',true,false,'PENDING'),
 ('10bet','10Bet',true,false,'PENDING'),('bwin','bwin',true,false,'PENDING'),('betano','Betano',true,false,'PENDING'),
 ('betplay','BetPlay',true,false,'PENDING'),('inkabet','Inkabet',true,false,'PENDING'),('betsafe','Betsafe',true,false,'PENDING'),
 ('bet365','bet365',true,false,'PENDING') ON CONFLICT(provider_slug) DO NOTHING;
INSERT INTO bookmaker_geo_availability(bookmaker_id,country_id,commercial_status,currency,public_priority)
 SELECT b.id,c.id,'CANDIDATE',v.currency,v.priority FROM (VALUES
 ('MX','betsson','MXN',10),('MX','codere','MXN',20),('MX','caliente','MXN',30),('MX','10bet','MXN',40),
 ('CO','betsson','COP',10),('CO','bwin','COP',20),('CO','betano','COP',30),('CO','codere','COP',40),('CO','betplay','COP',50),
 ('PE','betsson','PEN',10),('PE','betano','PEN',20),('PE','inkabet','PEN',30),('PE','betsafe','PEN',40),('PE','bet365','PEN',50)
 ) AS v(geo,operator,currency,priority) JOIN bookmakers b ON b.provider_slug=v.operator JOIN countries c ON c.iso2=v.geo
 ON CONFLICT(bookmaker_id,country_id) DO NOTHING;

-- Official regulator inventory verified on 2026-10-04. Legal evidence does not enable a feed or CTA.
UPDATE bookmaker_geo_availability g SET legal_status='VERIFIED',legal_verified_at='2026-10-03T20:50:00Z',
 legal_reference=v.reference,destination_domains=ARRAY[v.domain],currency=v.currency
 FROM bookmakers b,countries c,(VALUES
 ('CO','betsson','betsson.co','COP','https://coljuegos.gov.co/publicaciones/301841/juegosonline/ · Colbet SAS · contract 1895'),
 ('CO','codere','codere.com.co','COP','https://coljuegos.gov.co/publicaciones/301841/juegosonline/ · Codere Online Colombia SAS · contract 2218'),
 ('CO','betplay','betplay.com.co','COP','https://coljuegos.gov.co/publicaciones/301841/juegosonline/ · Corredor Empresarial · contract 1876'),
 ('CO','bwin','sports.bwin.co','COP','https://coljuegos.gov.co/publicaciones/301841/juegosonline/ · Bwin Latam SAS · contract 2229'),
 ('CO','betano','betano.co','COP','https://coljuegos.gov.co/publicaciones/301841/juegosonline/ · Kaizen Gaming Colombia SAS · contract 2104'),
 ('PE','bet365','bet365.pe','PEN','https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html · Hillside (Gibraltar Sports) LP · RD 2790-2024 · 21002578010000'),
 ('PE','betano','betano.pe','PEN','https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html · Kaizen Gaming Peru SAC · RD 1541-2024 · 21002562010000'),
 ('PE','inkabet','inkabet.pe','PEN','https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html · Lucky Torito SAC · RD 3859-2024 · 21002603010000'),
 ('PE','betsson','betsson.pe','PEN','https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html · SFTG Limited · RD 3220-2024 · 21002586010000'),
 ('PE','betsafe','betsafe.pe','PEN','https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html · SFTG Limited · RD 3386-2024 · 21002586020000')
 ) AS v(geo,operator,domain,currency,reference)
 WHERE b.id=g.bookmaker_id AND c.id=g.country_id AND c.iso2=v.geo AND b.provider_slug=v.operator AND g.commercial_version=0;

-- Deliberately retire only commercial promotion. Keep historical sports, quotes and analytics.
UPDATE bookmaker_geo_availability g SET affiliate_enabled=false,commercial_status='SUSPENDED',updated_at=now()
 FROM countries c WHERE c.id=g.country_id AND c.iso2='BR';
UPDATE affiliate_links l SET enabled=false,updated_at=now() FROM countries c WHERE c.id=l.country_id AND c.iso2='BR';
UPDATE affiliate_campaigns ac SET enabled=false,updated_at=now() FROM affiliate_links l,countries c
 WHERE l.id=ac.affiliate_link_id AND c.id=l.country_id AND c.iso2='BR';
UPDATE profile_sponsor_campaigns SET enabled=false,updated_at=now() WHERE locale='br';

ALTER TABLE affiliate_clicks DROP CONSTRAINT IF EXISTS affiliate_clicks_locale_check;
ALTER TABLE affiliate_clicks ADD CONSTRAINT affiliate_clicks_locale_check CHECK(locale IN ('br','mx','co','pe'));
ALTER TABLE affiliate_clicks DROP CONSTRAINT IF EXISTS affiliate_clicks_geo_check;
ALTER TABLE affiliate_clicks ADD CONSTRAINT affiliate_clicks_geo_check CHECK(geo IN ('BR','MX','CO','PE'));
ALTER TABLE affiliate_impressions DROP CONSTRAINT IF EXISTS affiliate_impressions_locale_check;
ALTER TABLE affiliate_impressions ADD CONSTRAINT affiliate_impressions_locale_check CHECK(locale IN ('br','mx','co','pe'));
ALTER TABLE affiliate_impressions DROP CONSTRAINT IF EXISTS affiliate_impressions_geo_check;
ALTER TABLE affiliate_impressions ADD CONSTRAINT affiliate_impressions_geo_check CHECK(geo IN ('BR','MX','CO','PE'));
ALTER TABLE profile_sponsor_campaigns DROP CONSTRAINT IF EXISTS profile_sponsor_campaigns_locale_check;
ALTER TABLE profile_sponsor_campaigns ADD CONSTRAINT profile_sponsor_campaigns_locale_check CHECK(locale IN ('br','mx','co','pe'));
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_locale_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_locale_check CHECK(locale IN ('br','mx','co','pe','en'));
COMMIT;
