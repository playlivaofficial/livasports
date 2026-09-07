# LivaSports M2 — Football Data Ingestion

## Scope

M2 ingests football data for Brazil and Mexico from Sportmonks into PostgreSQL. It does not ingest basketball, call OddsPapi, poll continuously, implement Match Center, build a bet slip, or redesign the temporary UI.

## Architecture

```text
Sportmonks HTTP gateway
  -> Sportmonks adapter and canonical normalizer
  -> persistent provider_entity_mappings
  -> FootballIngestionService
  -> PostgreSQL repositories
  -> DatabaseM2ReadService
  -> existing localized route components
```

React/page components do not instantiate providers. The production runtime reads fixtures through `FootballReadRepository`; when PostgreSQL is not configured it returns a clean empty state and never fabricates fixtures.

## Target configuration

Targets live in `src/config/footballCompetitions.ts`, not in page components or sync services.

- Brazil: Brasileiro Serie A, Copa do Brasil, Copa Libertadores
- Mexico: Liga MX, including Apertura/Clausura league names when Sportmonks exposes them

The adapter discovers provider competitions by name and country. Provider IDs are confined to `provider_entity_mappings`; LivaSports UUIDs remain canonical. Fixed LivaSports IDs from migration 001 are used for football, Brazil, and Mexico.

## Database writes and mappings

Migration `001_m1_foundation.sql` is unchanged. Additive migration `002_m2_data_ingestion.sql` adds:

- `seasons.is_current`
- `teams.image_url`
- `fixtures.provider_updated_at`
- `team_seasons`
- `ingestion_sync_runs`
- ingestion/read indexes

Every entity is upserted by its LivaSports UUID. Provider references are persisted separately and reused on later runs. Fixture upserts update the existing row; a missing provider result never deletes history. Team-season membership uses a composite primary key.

## Sync stages

`FootballIngestionService` exposes these explicit stages:

1. `syncCompetitions()`
2. `syncSeasons()`
3. `syncTeams()`
4. `syncFixtures()`
5. `syncFixtureScores()`

The default fixture window is seven days in the past through fourteen days in the future. Fixture retrieval is batched across selected competitions. Score refresh batches at most 50 existing fixtures per provider request. No timer, infinite loop, or scheduler is installed in M2.

## Commands

Local commands read ignored `.env` values. Hosted/manual runners may inject the same variables directly.

```bash
pnpm run db:migrate
pnpm run sync:football
pnpm run sync:fixtures
pnpm run sync:scores
pnpm run db:verify
```

Required server variables:

- `DATABASE_URL` (canonical)
- `SPORTMONKS_API_KEY`

For a Neon/Vercel integration, `DATABASE_POSTGRES_URL` and `POSTGRES_URL` are accepted only as server-side fallbacks when `DATABASE_URL` is absent. No database or provider variable may use `NEXT_PUBLIC_`.

## Time and status rules

Sportmonks kickoff values are parsed as instants and persisted in PostgreSQL `timestamptz`, so canonical storage is UTC. Brazil and Mexico local-day filtering occurs in the read service using `America/Sao_Paulo` and `America/Mexico_City`; timezone conversion never participates in fixture identity.

Normalized statuses are `SCHEDULED`, `LIVE`, `HALFTIME`, `FINISHED`, `POSTPONED`, `CANCELLED`, and `ABANDONED`. Provider timestamps are stored separately from the LivaSports row update timestamp.

## Health, errors, and request minimization

Every manual stage writes a health row containing status, inserted/updated counts, request count, timestamps, target, and a sanitized error indicator/message. Credentials and connection strings are never included.

Competition search, date-range fixture filtering, includes, pagination limits, multi-fixture score requests, and persistent mappings prevent per-user and obvious N+1 provider calls. OddsPapi is not called by ingestion or the DB-first page runtime.

## M3 considerations

M3 may add a scheduler, shared cache, locking, retry/backoff, and a deliberate live-score cadence. Those concerns are intentionally absent from M2 and should reuse the existing sync boundaries rather than call providers from page requests.
