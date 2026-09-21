# Native odds freshness continuity

## Operating contract

The normal five-minute scheduler is the only odds-fetching path. Monitoring, owner health, identity review and continuity sampling use persisted data and consume zero provider requests. Public navigation stays DB/cache-first.

For each eligible bookmaker/tournament batch, the deadline is the earlier of normal quota-scaled cadence and the earliest relevant persisted native expiry minus `ODDS_NATIVE_RESCUE_MARGIN_MINUTES` (default 10, bounded 5–30). Existing retry deadlines still win. Quote TTL is frozen when observed; this change does not extend it. Old quotes omitted by a more recent successful response do not cause an endless rescue loop.

Priority is approaching native expiry, expired recently-native recovery, near kickoff, public coverage value, then ordinary work. Rescue never bypasses verified-budget checks, the rolling automatic 80% hard stop, the 75% forecast target, account circuit breaker, target backoff, overlap deduplication, six-request tick cap, or execution deadline. Provider errors never overwrite valid stored prices; native expires normally and fallback then applies honestly.

## Telemetry and migration

Additive/idempotent migration `031_native_continuity.sql` adds only support evidence, five-minute continuity samples and per-job scheduler decisions. `032_native_continuity_rollups.sql` adds compact additive interval summaries so every owner read does not transfer an entire day of raw selections. Neither alters existing odds, aliases, fixtures, mappings, or migrations 029/030. Derived samples/decisions retain seven days. Dashboard continuity uses the latest 24 hours.

Decisions distinguish `DEFERRED_BY_DAILY_BUDGET`, `DEFERRED_BY_PRIORITY`, `PROVIDER_TRANSIENT_BACKOFF`, `TARGET_BACKOFF`, `CIRCUIT_BREAKER`, `NOT_DUE`, `MANUAL_PROTECTION`, `CATALOG_EMPTY`, `UNSUPPORTED`, and `REFRESHED`. Per-selection expiry misses remain separately visible. Planned requests left unexecuted are converted to a deferral, never reported as completed.

Native time and fallback time are **sampled selection-seconds**, not user time or exact wall-clock downtime. Intervals longer than 15 minutes are excluded. Native retention measures previously native selections still native at the next observation. Intra-sample transitions may be unobserved; no pre-instrumentation history is invented. The known expired tail is excluded from native time when the next observation is non-native. Cohorts are global, bookmaker, competition, market and kickoff-window. Rescue success requires fresh native persisted for all rescued targets, not merely HTTP 200; the action evidence separately counts targets refreshed before expiry.

Platform health is separate from upstream coverage: true absent markets limit upstream coverage but do not themselves degrade the platform. Pipeline loss, unknown rejection, unresolved in-window identities, missed expiry deadlines or a stalled scheduler degrade platform health. Legitimate quota/backoff constraints remain visible.

## Tournament 329

Saved OddsPapi catalog identifies **329 / copa-del-rey / spain / Copa del Rey**. Its future/upcoming counts are explicitly zero; historical isolated singular-bookmaker requests returned 404. This is not evidence of a wrong ID or permanent bookmaker non-support. Never-successful targets with 404 plus explicit empty catalog are dormant (`CATALOG_EMPTY`); repeated odds probes stop. Existing budget-controlled catalog discovery checks at most daily when canonical upcoming fixtures warrant it. A positive catalog count automatically re-enables probing. Permanent `UNSUPPORTED` is reserved for verified evidence, not inferred from empty-season 404s.

## Matching and source truth

Seven explicit contextual alias variants were reviewed against saved provider names and canonical same-role/same-kickoff fixtures. No fuzzy matching, club-suffix stripping, kickoff-tolerance change, timestamp correction or duplicate fixture creation. Bootstrap uses the existing strict matcher and persists only confirmed aliases. Conflicting/ambiguous future events remain a review list.

The native resolver now separates canonical bookmaker identity from data-supplier identity. Server-approved supplier order defaults to OddsPapi only. A future approved same-bookmaker supplier can win before cross-bookmaker fallback; duplicate selections inside one supplier remain rejected. **No secondary provider is configured or purchased.** Before activating one, add its ingestion adapter and supplier-aware persistence/mapping keys; the existing `odds_current` uniqueness still supports the current single supplier. Read-layer readiness is not a claim that secondary ingestion is operational.

Public order remains target-native → hidden Betano → eligible alternate native → unavailable. Provenance remains internal. Public bookmaker identities, affiliate gating, compact slip and generic approximate-price accessibility are unchanged.

## Verification and observation

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run secret:scan`.
- `npm run db:migrate` (second run must apply zero migrations), `npm run m5:verify`.
- `scripts/continuity-audit.ts --observe`: database-only five-minute sample; no manual refresh.
- `scripts/continuity-identity-review.ts`: database-only contextual unresolved review.
- Compare the saved pre-release 58-fixture cohort to post-release samples; distinguish changing cohort and upstream supply from continuity repairs.
- Release acceptance requires multiple **automatic production** cycles and pre-expiry rescue evidence. Deployment alone is not completion.

Initial pre-release evidence (2026-09-21 11:38 UTC): Betsson 28/58 native, Sportingbet 27/58 (16 complete 1X2), betboo 32/58. Saved alias bootstrap: 720→745 aliases, unresolved future identities 47→46, in-window unresolved 0, pipeline loss 0, duplicate/orphan odds 0. Simulation: 105/day average, 176 peak, paced allowance 275, scale 1.95. This is a fixture-window forecast, not guaranteed future consumption. Production acceptance remains pending until release and time-based observation.
