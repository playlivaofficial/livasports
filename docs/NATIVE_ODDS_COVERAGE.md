# Permanent native odds coverage

## Operating contract

The existing protected five-minute scheduler owns this system. Public navigation, slip resolution and coverage monitoring never fetch OddsPapi. The approved request cadence, monthly allowance, 80% automatic stop, controlled reserve, backoff and batching limits are unchanged.

Public targets remain Betsson, Sportingbet BR and betboo BR. The resolver remains own fresh REAL → fresh hidden Betano → eligible alternate REAL → unavailable. Insurance is not persisted as native bookmaker truth. Internal attribution remains intact; public source badges/notes remain removed. Affiliate approvals and GEO authorization are unchanged.

## Identity and ingestion

- `provider_entity_mappings` is the durable provider-team and fixture identity registry.
- Migration `030_native_odds_coverage.sql` adds `odds_team_aliases`, `odds_native_diagnostics` and `odds_native_rollups`. It is additive and idempotent; no existing data is rewritten by the migration.
- Confirmed names are saved against provider, canonical competition and canonical team, not a season or deployment. Accents, punctuation and whitespace use the existing normalizer. Reviewed code aliases remain bootstrap evidence, not the only future matching mechanism.
- Matching uses confirmed provider team IDs first, contextual durable aliases second, and reviewed/exact names third. Home/away roles, sport, competition, ten-minute kickoff tolerance, persisted kickoff reconciliation and one-to-one fixture mappings remain mandatory. Ambiguous names/events are rejected, never fuzzily guessed.
- Ingestion, diagnostic bootstrap and recovery use the same snapshot ambiguity checks. Accepted aliases and quote diagnostics are persisted in the ingestion transaction.
- Normalizer rejection evidence retains names, tournament/event/market/outcome identifiers, kickoff, price and activity flags. Unsupported markets are counted in aggregate, avoiding thousands of redundant rows per fetch.
- Persistence is checked against the quote table. A newer saved valid price missing from storage remains an ingestion defect even if an older still-fresh native price can be shown.

## Automatic recovery

Every scheduler tick checks at most three recent saved responses with unresolved identity or persistence defects, under the existing worker lease. Confirmed identities permit replay without a new provider request. Original observation times, expiries and newer stored prices are preserved. Unresolved ambiguity does not trigger a provider retry. Checks are recorded in `odds_recovery_actions`; oldest-check rotation prevents permanently unresolved responses starving repairable ones.

This does not invent aliases or fix unverified kickoff disagreements. Such responses remain available for evidence-based reconciliation. A recovery replay cannot extend a quote's original freshness lifetime.

## Health and regression detection

Owner health shows seven-day upcoming coverage by public bookmaker, competition, canonical market and kickoff window (0–2h, 2–24h, 1–3d, 3–7d). It reports any native fixture, complete market, fallback and unavailable counts. Complete all-market coverage is deliberately distinct from any native coverage. Fixture categories can overlap across different selections.

Every missing native selection receives one reason: `PROVIDER_GAP`, `INGESTION_BUG`, `IDENTITY_UNRESOLVED`, `MARKET_MAPPING_FAILURE`, `STALE_OR_EXPIRED`, `SUSPENDED_OR_REMOVED`, `QUOTA_OR_BACKOFF_DELAY`, or `UNKNOWN_PIPELINE_DEFECT`. Provider gaps require saved response evidence; old/missing evidence is not automatically proof of no provider support. Quota/backoff attribution requires an actual protection state.

15-minute cohort rollups are written from the existing reliability evaluation, not a second provider poller. A seven-day rolling median, at least three historical samples and at least three fixtures per cohort suppress empty/unsupported-cohort noise. A ≥30-point native collapse plus ≥20-point fallback increase raises a regression; an unresolved-selection increase of seven also raises a cohort regression. Persistence loss and unexplained gaps raise existing owner incidents. A broken audit is explicitly unavailable, not healthy. New baselines need a warm-up period; synthetic test coverage is not evidence that a real production regression happened.

Only already-due requests are reordered using native coverage need. Existing near-kickoff batch urgency and anti-starvation ordering remain; known provider gaps do not earn extra polling. No additional market-specific requests are introduced.

Derived diagnostic retention is seven days, rollups fourteen days; cleanup is bounded. Canonical aliases/mappings and saved responses are not deleted by this feature.

## Current evidence, 2026-09-21

58 identical upcoming fixtures were audited before and after saved-response repair. Betsson gained five displayed selections for Ceuta–Real Sociedad B: complete 1X2 and OU2.5 rose 40→41. Sportingbet remained 27 any-native / 16 complete 1X2; betboo remained 32 / 32. There is no fabricated new-book improvement. Ten latest new-book saved snapshots had zero missing persisted selections. Cached raw Sportingbet Série B responses contain markets 104/1010 but not 101; betboo responses contain all three. Suspended Sportingbet prices remain unusable.

The bounded repair restored 19 rows across the wider stored horizon, five in the 58-fixture sample. Replaying the same three responses produced zero current writes, history additions or closures. The sample audit then reported zero native pipeline losses. 47 later-horizon identities remain safely unresolved, largely kickoff disagreements; none are in the current seven-day sample. This is not a promise that upstream odds exist for every competition.

No paid provider requests were made for audit/bootstrap/recovery. Normal scheduled traffic continues independently. Migration rerun applied nothing. Integrity snapshot: 34 competitions, 43,397 fixtures, 2,388 teams, 46,976 provider mappings, 6,289 stored odds, zero duplicate/invalid/orphan odds, zero unapplied snapshots.

## Sparse home and regression boundaries

Default home composes live today, upcoming today, tomorrow upcoming only when fewer than four useful rows exist, then today's results. Fixture IDs are deduplicated and periods localized in PT-BR/EN/ES-MX. Explicit tabs/dates/competition hubs retain their previous query behavior. Additional tomorrow reads use the existing DB/cache path.

Compact slip, exact decimal math, three operator groups, hidden insurance, 44px odds targets, owner auth, commercial controls and M3 cache/provider isolation are unchanged.

## Verification commands

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run secret:scan
npm run db:migrate
npm run m5:verify
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env scripts/native-coverage-audit.ts
```

The last command is DB-read-only by default and writes an ignored local report. `--record` records derived metrics; `--bootstrap` initializes aliases/diagnostics from saved responses; `--repair` performs one bounded leased recovery; `--verify-replay` repeats the last three repairs for idempotency. These flags never call a provider. Do not run bootstrap/backfill routinely; normal ingestion maintains the system.

Check release SHA/READY, live owner-health metrics and automatic rollup timestamps after deployment. Observe actual scheduled operation; do not claim indefinite uptime from one acceptance window.
