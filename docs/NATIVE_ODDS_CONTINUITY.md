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

## Production acceptance — 2026-09-21 12:06 UTC

**PASS for bounded production acceptance**, not a claim of indefinite upstream availability. Implementation `9467e8202bed7d466b4839da26d763fc9536942d` deployed Ready as `dpl_Az88zpuUBpY6itk1Gg5SNnTEXg2t` to the existing LivaSports project and apex domain. The follow-up commit containing this evidence also fixes an owner-dashboard hydration warning: relative times now use the serialized health snapshot timestamp, not independent server/client clocks. Final deployed follow-up SHA/ID are recorded in the task's release result.

### Same 58-fixture cohort

Baseline 11:29 UTC; automatic production samples 11:55:11, 12:00:32, 12:05:07 UTC. All 58 fixture IDs remain in the intersection. Values below are fixture counts unless explicitly labeled selection-time.

| Measure | Betsson before → after | Sportingbet before → after | betboo before → after |
|---|---:|---:|---:|
| Any fresh native | 28 → 44 | 27 → 28 | 32 → 32 |
| Complete native 1X2 | 28 → 44 | 16 → 16 | 32 → 32 |
| Complete native OU2.5 | 28 → 44 | 27 → 28 | 32 → 32 |
| Complete native BTTS | 3 → 3 | 27 → 28 | 32 → 32 |
| Sampled native selection-time | 35.96% → 55.67% | 38.42% → 38.88% | 55.17% → 55.17% |
| Sampled fallback selection-time | 37.93% → 18.23% | 35.47% → 35.01% | 18.72% → 18.72% |
| Stale/expired selections | 80 → 0 | 0 → 0 | 0 → 0 |
| Backoff-delayed selections | 70 → 70 | 70 → 70 | 70 → 70 |
| Observed native→fallback transitions | 0 → 0 | 0 → 4 | 0 → 0 |
| Observed expiry refresh misses | 0 → 0 | 0 → 0 | 0 → 0 |

Global native selection-time increased **43.19% → 49.91%**; fallback selection-time decreased **30.71% → 23.99%**. These are sampled intervals, not reconstructed historical uptime. The pre-instrumentation 41→25 Betsson decline cannot honestly receive a historical transition count. Its 16 expired fixtures recovered to 44/58 and remained there across the observed cycles. A full-day Betsson retention claim is not established by this short observation.

Fixture-level “any fallback” remains 37/58, 28/58, 12/58 respectively: one fixture can have native 1X2 and fallback BTTS simultaneously. This overlapping measure is not the selection-time fallback share above.

### Automatic expiry-boundary proof

- 11:55: automatic catalog discovery (1 request), then Betsson and hidden Betano MLS recovery (2 requests). Job SUCCEEDED.
- 12:00: Sportingbet and betboo each fetched tournaments **155,390** in one request per bookmaker. **2/2 rescue batches succeeded, 4/4 targets refreshed before expiry**, 36 + 63 current writes. Observed response times 12:00:29.097 and 12:00:31.412 UTC preceded original 12:05:09–12:05:16 deadlines.
- 12:05: automatic job SUCCEEDED with **0 provider requests**.
- At 12:06:37, **51/51 selections that were native in the first production sample and had crossed their original expiry were still fresh native**, with newly fetched expiries. No TTL was extended in place.
- Four Sportingbet selections on one later Série B fixture switched to fallback because the provider suspended OU/BTTS; eight selections recovered. Zero pipeline loss, unknown pipeline defects, or in-window unresolved identities.
- Across the baseline→first-production transition, 80 Betsson selections recovered. The after-only interval excludes that initial recovery and measures sustained native time instead.

### Quota and precise delays

**5 OddsPapi requests total in acceptance, all automatic: 4 odds + 1 catalog; 0 monitoring/manual/diagnostic provider calls.** No retries or failures during this bounded window. Rolling 24h 156/275 (56.7%); UTC today 60; period usage 1,635; conservative remaining 3,115; routine remaining 3,015; automatic ceiling 220, leaving 64 requests to that ceiling and 119 to paced allowance. Pressure NORMAL. Historical projection 190/day and end-of-day projection 120 are estimates, not quotas. Fixture-window simulation after recovery: 113/day average, 176 peak (41.1% / 64.0% of 275), scale 1.95. Existing protection thresholds and frozen TTLs unchanged.

Latest decision counts: 100 NO_ELIGIBLE_FIXTURES, 20 NOT_DUE, 8 TARGET_BACKOFF; zero DEFERRED_BY_DAILY_BUDGET, DEFERRED_BY_PRIORITY, CIRCUIT_BREAKER, or PROVIDER_TRANSIENT_BACKOFF. The 210 affected public selections are TARGET_BACKOFF (70 per visible bookmaker), not daily-budget exhaustion. Retry times and individual targets are retained in owner details and the private evidence artifact.

### Provider truth and tournament 329 update

Cached raw Sportingbet evidence contains OU/BTTS markets 104/1010 but omits 1X2 market 101 for six inspected Série B fixtures; two were suspended. betboo supplies 101/104/1010 for those same identities. There is no capture failure to repair. Current provider-gap selections remain 376 (Betsson 110, Sportingbet 154, betboo 112); suspended/removed changed 26→22.

**New evidence supersedes the old empty catalog:** automatic 11:55 catalog discovery returned Copa del Rey **329**, Spain, slug `copa-del-rey`, **20 future / 0 upcoming / 0 live fixtures**. Correct identity and request shape are confirmed; old all-bookmaker 404s did not prove permanent non-support. The empty-catalog dormancy automatically lifted, preserving existing per-bookmaker 12-hour backoff. No 329 odds request was made during acceptance. The next normal bounded probe may establish bookmaker supply; it is **not yet proven supported for prices**. Never mark permanent UNSUPPORTED from this evidence. No repeated immediate 404 polling occurs.

Future identity review reduced 47→46 unresolved and increased durable aliases 720→745, without fuzzy matches or tolerance changes. Conflicting kickoff/team identities remain deliberately unresolved. No secondary provider was enabled; only the approved same-bookmaker resolver extension point is ready.

### Release gates and preserved behavior

- Tests: **1,209 passed** (1,192 Vitest + 17 Node); typecheck, lint, production build, secret scan PASS.
- Remote secret scan: 15 public documents/assets, zero credential leaks. No environment or local-only evidence files tracked.
- Migrations 031/032 applied; rerun applies none. Post-rescue DB: 34 enabled competitions, 43,397 fixtures, 2,388 teams, 47,009 mappings, 6,465 current quotes, 30,544 history rows, 511 matched fixtures; zero duplicate/invalid/orphan quotes, running jobs or unapplied snapshots.
- Production EN/PT-BR/ES-MX, light/dark, 320/390/430/1440 rendering checked; page overflow 0, odds controls at least 44px. Match Center and existing slip retained; no selections or stake changed.
- Exactly three visible bookmaker identities, hidden Betano, no public source-name badges. Affiliate configuration untouched.
- Public match/search API responses and production route/profile logs show providerRequests=0. Health reads and audit scripts make no provider calls.
- Platform CONSTRAINED / upstream LIMITED: the backoff/provider gaps are explicit, not falsely labeled all-green.

Reproduce DB-only acceptance with `scripts/continuity-acceptance.ts --since=2026-09-21T11:53:00Z` using the existing secure environment/preload conventions. Raw evidence is intentionally ignored in `output/continuity-acceptance-private.json`. Do not re-run ingestion or manual odds refresh to manufacture a passing sample.
