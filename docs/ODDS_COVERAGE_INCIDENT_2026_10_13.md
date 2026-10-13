# LivaSports missing odds incident audit

## Status and evidence boundary

Saved-provider evidence parity passes after recovery: zero missing fresh outcomes across six country/operator combinations in the controlled 308-fixture cohort. The live upstream incident is **not yet proven resolved**. OddsPapi returned HTTP 500 to both the account check and the bounded tournament canary; retries stopped. A response not returned during that outage is not proof that a bookmaker does not offer a match.

Baseline: `1363bbc6396cc40321fc716da7e623f84c99034c`. Before capture: 2026-10-13 08:24:28 UTC. After recovery: 08:58:48 UTC. Release and final browser acceptance evidence are recorded below after deployment.

## Coverage before and after

The denominator is the same 308 upcoming, scheduled, non-pending fixtures within seven days, across 23 approved acquisition competitions. Thirty-eight fixtures in four historical enabled competitions outside the current acquisition set are reported separately, not silently included or re-enabled. JSON evidence includes each public fixture ID, competition counts, request budget and refresh timestamps.

“Returned” means matched in the latest saved successful response for that bookmaker/tournament; it does not imply all markets were active. “Stored” includes suspended or expired prices. “Current” means the production read rules accept at least one genuine local price under the unchanged expiry policy. These are exhaustive database/read-model counts, not a claim that every fixture was manually clicked in a browser.

| GEO | Operator and exact provider ID | Returned | Stored before → after | Current before → after | Fresh outcomes previously missing → after |
|---|---|---:|---:|---:|---:|
| MX | Betsson `betsson` | 214 | 207 → 214 | 172 → 177 | 35 → 0 |
| MX | Winpot MX `winpot.mx` | 233 | 224 → 233 | 129 → 133 | 24 → 0 |
| CO | Betsson `betsson` | 214 | 207 → 214 | 172 → 177 | 35 → 0 |
| CO | bwin `bwin` | 190 | 182 → 189 | 171 → 178 | 49 → 0 |
| PE | Inkabet `inkabet` | 214 | 207 → 214 | 165 → 170 | 35 → 0 |
| PE | 1xBet `1xbet` | 206 | 196 → 204 | 102 → 104 | 14 → 0 |

Before-missing counts are evaluated retrospectively against the recovered, still-valid saved provider evidence and the original before-read snapshot. Otherwise an unmapped provider fixture would incorrectly be excluded from its own missing-coverage denominator. Betsson is fetched once and persisted separately for both verified GEOs; the duplicated GEO counts are not two upstream requests.

| GEO and operator | Complete 1X2 before → after | Complete OU2.5 before → after | Complete BTTS before → after | Latest successful saved response UTC |
|---|---:|---:|---:|---|
| MX Betsson | 169 → 174 | 170 → 175 | 172 → 177 | 01:30:20 |
| MX Winpot | 127 → 131 | 92 → 95 | 115 → 118 | 08:10:18 |
| CO Betsson | 169 → 174 | 170 → 175 | 172 → 177 | 01:30:20 |
| CO bwin | 171 → 178 | 171 → 178 | 171 → 178 | 01:30:22 |
| PE Inkabet | 162 → 167 | 163 → 168 | 165 → 170 | 01:30:25 |
| PE 1xBet | 100 → 102 | 91 → 93 | 88 → 90 | 06:40:18 |

All timestamps are October 13. Observation/expiry, not merely the time a bookmaker last changed its price, determines validity. No timestamp was refreshed artificially and no TTL was extended by this repair.

## Root causes and fixes

### Betsson

Competition-scoped participant variants prevented Colombian and Conference League fixtures from matching. A newer unresolved review shared across feeds also hid already mapped older valid prices. Exact competition, both participant roles, ten-minute kickoff tolerance and uniqueness remain mandatory. Reviewed aliases and replay of the newest saved identity evidence repair the mapping without weakening the read guard. Repeated empty FA Cup responses consumed 32 requests in the previous rolling day.

### Winpot MX

Colombian A/B and Saudi participant variants prevented persistence. Its latest Conference League response carried suspended markets plus unresolved identities; the shared identity review suppressed genuine prices from other feeds. Repairing that identity does not activate Winpot's suspended markets. Current Winpot coverage remains materially lower than its fixture-return count because the saved feed explicitly suspends many markets.

### bwin

Colombian, Conference League and FA Cup name variants prevented otherwise active prices from reaching the exact canonical fixtures. Saved-response recovery restores seven fixtures with genuine prices. No bwin price is copied into Betsson, Inkabet or Winpot columns.

### Inkabet

Colombian, Conference League and Saudi variants, including a newer shared unresolved review, prevented valid mapping. Recovery restores five current fixtures. Empty FA Cup responses consumed another 32 requests in the previous rolling day. Suspended or inactive prices remain blocked.

### 1xBet

Colombian and Conference League identities required repair. Only two recovered fixtures contain selectable fresh prices; the other mapped markets remain suspended. The previously approved 1xBet listed-market interpretation is unchanged; no generic relaxation of collection, market or price activity flags was introduced.

### Shared operational defects

- Historical-success HTTP 404 responses retried every 30 minutes indefinitely. Repeated empty-target retries now back off through 30, 60, 120, 240, 480 and at most 720 minutes. The never-successful target policy, 5xx controls, quota/cadence model and paid plan remain unchanged.
- Replaying old responses could erase a newer failed attempt and backoff. Refresh-target updates now compare against the latest check, success **and attempt**. Older evidence may repair identities, but cannot erase a newer operational failure.
- An expired matchweek's `MAPPING_EMPTY` state could block all future matchweeks. The block now persists only while that saved payload has upcoming unresolved fixtures; explicit mapping/market hard failures remain blocked.
- Automatic saved-response recovery searched only one day and could spend its three-item bound on expired events. It now looks back seven days, filters for still-upcoming unresolved provider fixtures and retains its maximum of three snapshots. No provider fetch is added.
- Match Center's first DB-backed odds request waited for intersection/scroll. It now runs on initial visibility and pageshow, while recurring refresh remains throttled and viewport-aware. Loading is not shown as absence. Localized explanations distinguish unverified coverage, observed gaps, stale/suspended/closed odds, ingestion delay and provider/quota failure. Failure metadata cannot erase saved valid prices.

## Data safety and idempotency

Eleven saved snapshots produced 227 quote/history writes. A second pass over 15 snapshots produced 133 additional writes for newly mapped suspended rows and identity repair; already repaired rows produced zero writes. A controlled repeat of those four newly changed snapshots produced **zero current writes, zero history changes and zero closures**. Total: 360 quote/history writes, zero provider requests for recovery, zero fixture creation and no user-data modifications.

Recovery used the existing job lease, transactions, original payloads, original observations, monotonic quote guards and provider mappings. Suspended rows were persisted as suspended. No schema migration, subscription change, new bookmaker, inferred GEO entitlement or secret change was required.

## Scheduler and quota

At 08:58 UTC, the automatic scheduler was still running every five minutes. Its latest successful upstream refresh was Winpot at 08:10. The next current plan deadline was 16:00; operational status remained PARTIAL, not falsely green.

The previous rolling day spent 64 of 154 billable calls on the two empty FA Cup targets. This incident added two network requests: one unmetered account request at 08:28:26 and one billable tournament request at 08:43:35. Both returned 500. An intermediate cooldown rejection made no network call. No further upstream probes were made after the second failure.

Afterward: 155 rolling-day billable requests; 56 UTC-day requests; daily paced cap 194; normal stop 155; controlled stop 174. Routine headroom was zero and protected controlled headroom 19. Period usage was 739 of 5,000, with 4,011 remaining under the internal safety cap. The current seven-day plan forecast 63 requests/day, peak 98, versus 194 paced allowance. These are model forecasts, not observed proof that future provider failures will stop.

All exact feed identities are present in verified account/mapping state. Existing source domains are retained, including provider-declared shared infrastructure domains; domain strings are not used to invent another operator's identity. The successful saved feed evidence is stronger than a logo or catalog name alone.

## Genuine unavailability and remaining limits

The saved responses include explicit suspended market/price flags, expired observations, fixture omissions and intentionally out-of-scope markets. They remain non-executable. Complete market counts above expose the real gaps. Generic bookmaker collection flags are not blindly reinterpreted as permission to activate prices. See the [official response schema](https://oddspapi.io/en/docs/get-odds-by-tournaments) for the distinct bookmaker, market and price activity fields.

Not-returned fixtures and ambiguous collection flags require a successful fresh upstream response before being called genuinely unavailable now. The HTTP 500 outage prevents that final claim. Strict kickoff and duplicate-identity rejections remain in place; none were bypassed to inflate coverage.

## Verification

- Local full suite: 17 Node tests plus 2,765 Vitest tests, total **2,782 PASS**. Lint, typecheck, production build and secret scan PASS. Local build emits the existing metadataBase fallback warning without production environment configuration.
- Regression coverage: reviewed aliases and wrong-role/competition/kickoff/duplicate guards; old-replay monotonicity; bounded 404 escalation; expired matchweek unblock; saved-recovery bound; localized availability; exact GEO diagnostics. Existing signed admission, changed-price confirmation, race protection, expiry, same-book accumulators, partial coverage and affiliate tests remain passing.
- Actual local browser: Villarreal–Napoli's available bwin quote adds a signed 2.10 bwin HOME selection; Betsson is honestly 0/1 and has no complete-slip CTA. Reload preserves the same identity. Only the newly created local selection was removed afterward; existing production and other-origin selections were untouched.
- No affiliate destinations, logo CTAs, commercial eligibility, sponsor banners, source truth, signed-selection policy or paid provider configuration changed.

## Reproduction

With the existing authorized environment loaded in memory, run `node --import tsx scripts/odds-incident-audit.ts --label=verification`. Default mode is DB-read-only and never calls OddsPapi. It emits ignored private detailed evidence with the approved cohort, each market/outcome, source timestamps, ingestion/read parity, per-competition totals and quota telemetry.

An optional `--canary` exists only for a specifically controlled upstream test: maximum four tournament IDs, five exact verified feeds, six authenticated attempts including account, zero automatic retries, existing quota/cooldown and job lease. Do not run it during a known upstream outage or to bypass exhausted routine capacity. No keys appear in output.

## Release acceptance

PR, hosted CI/review, production SHA and rendered MX/CO/PE acceptance: pending release gates. The incident must not be called fully resolved until a successful bounded current upstream check or successful automatic refresh closes the remaining live-provider uncertainty.
