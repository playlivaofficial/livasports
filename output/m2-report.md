# LivaSports M2 — Football Data Ingestion + Database Sync Report

## M2 status

**COMPLETE — PASS WITH MEXICO PROVIDER-COVERAGE LIMITATION**

M2 now uses a PostgreSQL-backed ingestion and read path. No UI redesign, M3 feature, basketball ingestion, bet slip, full Match Center, or production polling was added.

## Database and environment

- Existing Vercel project inspected: `nikapopkha3-4447s-projects/livasports`.
- Neon created `DATABASE_URL` for Development, Preview, and Production; it is the canonical application variable.
- Safe server-only fallbacks support `DATABASE_POSTGRES_URL` and `POSTGRES_URL` only when `DATABASE_URL` is absent.
- No database/provider credential is public, printed, or committed.
- PostgreSQL driver: `pg`; no SQLite fallback.

## Migrations

| Migration | Result |
| --- | --- |
| `001_m1_foundation.sql` | APPLIED to Neon production |
| `002_m2_data_ingestion.sql` | APPLIED to Neon production |
| Idempotent migration rerun | PASS — zero pending migrations |

Migration 001 was not modified. Migration 002 adds current-season, team image, provider fixture timestamp, team-season membership, ingestion health, and supporting indexes.

## Ingestion implementation

Created/changed areas include:

- safe PostgreSQL client and migration runner
- PostgreSQL provider-mapping and football repositories
- in-memory repository used only for deterministic tests
- target competition configuration
- staged `FootballIngestionService`
- controlled migration/sync/read CLI commands
- persistent health records and provider request counts
- Sportmonks competition discovery, country/team image enrichment, and request counting
- DB-first page service/runtime with zero request-time provider calls

## Configured competitions

- Brasileiro Serie A
- Copa do Brasil
- Copa Libertadores
- Liga MX (Apertura/Clausura names supported when returned)

The controlled production sync intentionally selected only Brasileiro Serie A and Liga MX.

## Controlled Sportmonks/Neon validation

### Persisted Brazil sample

| Entity | Count |
| --- | ---: |
| Competitions | 1 — Serie A (`brasileiro-serie-a`) |
| Relevant seasons | 1 |
| Teams | 20 |
| Fixtures in the -7/+14 ingestion window | 33 |
| Finished | 11 |
| Scheduled | 21 |
| Postponed | 1 |
| Sportmonks mappings | 59 total |

Mapping breakdown: 1 sport, 1 country, 1 competition, 3 season references discovered, 20 teams, and 33 fixtures. Only the current/relevant season was persisted; provider mappings for discovered season references remain reusable.

### Mexico sample

**NO SAMPLE — CURRENT SPORTMONKS SUBSCRIPTION RESPONSE RETURNED NO MEXICO LEAGUES.**

`Liga MX`, `Liga BBVA`, and `Primera Division` league-name searches returned empty data. The official country lookup found Mexico, but the country-leagues endpoint also returned an empty accessible league set. M2 did not fabricate or mislabel a league. `/mx` therefore reads a correct empty DB state.

### Requests consumed

- Application-tracked sync requests: 16 total
  - preliminary empty discovery: 2
  - first successful Serie A persistence run plus Liga MX attempt: 7
  - idempotency rerun plus Liga MX recheck: 7
- Focused Mexico discovery diagnostics: 5
- **Total controlled Sportmonks HTTP requests: 21**
- OddsPapi requests: **0**

### Idempotency rerun

The second successful run produced zero inserts and updated the same canonical rows:

- competition stage: 0 inserted; 4 updates (sport, countries, competition); 3 provider requests
- season stage: 0 inserted; 1 updated; 1 provider request
- team stage: 0 inserted; 21 updates (country plus 20 teams); 1 provider request
- fixture stage: 0 inserted; 33 updated; 1 provider request
- score stage: 0 inserted; 21 updated; 1 provider request

Table counts remained 1 competition, 1 season, 20 teams, 33 fixtures, and 59 mappings. Duplicate prevention therefore passed.

## DB-first reads

| Read | Result |
| --- | --- |
| Brazil football window | PASS — available; 1 competition; 17 fixtures; 0 OddsPapi requests |
| Mexico football window | PASS — available empty state; 0 competitions; 0 fixtures; 0 OddsPapi requests |
| Page/component direct provider calls | NONE |

Brazil/Mexico today and live filters use GEO-aware boundaries over UTC `timestamptz` storage and normalized DB statuses.

## Automated tests

- Node validation suite: PASS — 6/6
- Vitest suite: PASS — 39/39 across 15 files
- Added coverage: competition/season idempotency, team membership/mapping, fixture mapping/duplicate prevention, status normalization, UTC conversion, score update, finished score persistence, empty response retention, sanitized provider failure health, and DB-first read behavior.

## Quality gates

| Gate | Result |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS — zero warnings |
| `pnpm run test` | PASS — 6/6 Node and 39/39 Vitest |
| `pnpm run build` | PASS — Next.js 16.3.4 production build |
| Client static assets | PASS — 12 files, 0 credential-name matches, 0 secret-value matches |

## Git and production deployment

- M2 code commit: `a4fa4ea` (`feat: add M2 football database ingestion`)
- Repository/branch: `playlivaofficial/livasports`, `main`
- Push: PASS
- Existing Vercel project only: `nikapopkha3-4447s-projects/livasports`
- Deployment: `dpl_9YwcVBsW2bmPw6qtAE7agUuQLE9P`
- Deployment state: READY
- Production aliases: `livasports.com`, `www.livasports.com`, and existing Vercel aliases

## Production smoke test

| Check | Result |
| --- | --- |
| `/` | PASS — HTTP 307 to `/br` |
| `/br` | PASS — HTTP 200 |
| `/mx` | PASS — HTTP 200 |
| `/br/futebol` | PASS — HTTP 200; DB-backed Serie A content present |
| `/mx/futbol` | PASS — HTTP 200; localized empty DB state present |
| `/br/ao-vivo` | PASS — HTTP 200 |
| `/mx/en-vivo` | PASS — HTTP 200 |
| `/br/jogos/hoje` | PASS — HTTP 200 |
| `/mx/partidos/hoy` | PASS — HTTP 200 |
| `www.livasports.com` | PASS — HTTPS HTTP 308 to apex |
| Production client assets | PASS — 8 JS assets; 0 credential-name and 0 secret-value matches |

Production `/br/futebol` rendered Serie A from Neon without an unavailable-provider banner. Production `/mx/futbol` rendered the correct localized no-data state. Page rendering consumed zero OddsPapi requests and made no Sportmonks request.

## Known limitations

- The current Sportmonks subscription returned no accessible Liga MX competition, so Mexico persistence is a truthful no-sample result rather than a fabricated success.
- M2 provides manual sync commands only; scheduling, distributed locks, shared caching, retry/backoff policy, and live polling are deferred to M3.
- Odds remain separate and were not ingested or requested during M2.
- The UI remains intentionally temporary.

## Recommended M3 scope

After Mexico coverage is resolved with Sportmonks, M3 should schedule the existing sync stages with locking, shared cache, conservative retries, and a measured live-score cadence. It should not bypass the PostgreSQL read path.
