# LivaSports P5 — production acceptance

P5 implementation and bounded production acceptance: PASS, with coverage and operational limitations below. Evidence captured 21 September 2026; freshness is point-in-time, not a permanent guarantee.

## Release

- Tested production code SHA: `33d657cc30db411f8505e53fa79423988f4aee14`.
- Verified code deployment: `dpl_DBTM5GPEwubobSbkfULFxBEB5ipW`, READY on existing `nikapopkha3-4447s-projects/livasports`. Apex health returned that exact SHA.
- Feature branch `codex/p5-three-visible-four-source-odds` pushed; main safely fast-forwarded and pushed. Existing linear workflow, no PR or force push. A final documentation-only revision may supersede this code SHA; its deployment is recorded in the final handoff.
- No automatic GitHub test CI is configured. Local gates PASS; Vercel preview/production builds PASS. This is not a GitHub Actions test-run claim.
- https://livasports.com: HTTPS, apex and www → apex 308 verified.

## Product/source truth

Three public targets only: Betsson, Sportingbet BR, betboo BR. Betano is hidden insurance, never a fourth card/logo/affiliate target. Exact own REAL → fresh REAL Betano → lowest fresh REAL alternate → unavailable. No synthetic prices, proxy chains or persisted proxies. Visible estimated/source labels work on touch devices.

Production observed Betsson REAL, betboo REAL and Sportingbet estimated from Betano. After old-source expiry, alternate insurance from betboo was observed with explicit labels. Expired native prices were not retained as REAL.

Live 1/3/5/10-leg BR/MX comparisons returned HTTP 200, three unique targets, correct REAL/ESTIMATED classifications and providerRequests=0. Exact decimal/provenance tests cover REAL/Betano/alternate/mixed/incomplete cases for all four sizes.

Existing saved owner-browser selection and stake were preserved. Its finished match correctly returned three unavailable cards without a valid total/CTA. No pre-existing user data changed.

Approved Betsson link remains active in authorized BR preview; noneligible requests remain gated. Sportingbet/betboo NOT_APPLIED, affiliate disabled. No destination, approval, subscription or billing change.

## Bounded acceptance and integrity

The manual bounded checker stopped before reserving a provider request while the automatic production run was active. Its generic diagnostic did not retain the specific stop code; it was not blindly retried. Successful scheduler responses were reused instead.

- Acceptance window 08:49–09:03 UTC: **12 billable scheduled requests**, ten HTTP 200 and two HTTP 404 for tournament 329 (one per new book). Zero manual provider calls, historical backfill or immediate retries.
- Successful tournament IDs: 155, 390, 27464, 242, 54; one pregame request per bookmaker/tournament, singular bookmaker parameter.
- Six saved successful snapshots replayed: **0 provider calls, 0 current writes, 0 history changes, 0 closures**. Each new book's first sample returned 11 fixtures and matched 10; mismatches were not guessed.
- Migration 029 applied, additive/conflict-safe and rerun verified. No fixture/user/history reset.
- Final DB snapshot: **34 enabled competitions, 43,397 fixtures, 6,236 stored odds rows; zero duplicate/orphan odds, zero active jobs**.
- Stored rows: Betsson 2,604; Betano 3,248; Sportingbet 174; betboo 210. These include noncurrent statuses.
- Latest new-source observations: Sportingbet 08:55:11.371Z; betboo 08:55:13.872Z. Original expiry remains enforced.

## Actual fresh REAL coverage — 09:03 UTC

Denominator: 58 upcoming scheduled fixtures in the seven-day DB window. Market counts require all exact selections.

| Source | Any current REAL fixture | Complete 1X2 | Complete OU2.5 | Complete BTTS |
|---|---:|---:|---:|---:|
| Betsson | 39/58 | 39 | 39 | 2 |
| Sportingbet BR | 26/58 | 16 | 26 | 26 |
| betboo BR | 30/58 | 30 | 30 | 30 |
| Betano BR — hidden | 27/58 | 27 | 27 | 27 |

Next 24h, five fixtures: Betsson 2, Sportingbet 4, betboo 5, Betano 2 with some current REAL data. Seven-day displayed-selection proxy proportion 34.6%. Initial sample was correctly flagged PROXY_DOMINANT; coverage improved as scheduled batches arrived. Insurance is never counted as REAL target coverage.

## Quota and operations

Approved quota model unchanged. At 09:03, dynamically paced allowance 272/day: rolling usage 177 (**65.1%**), 95 below full allowance, 40 before automatic stop 217, 67 before controlled stop 244. UTC-day usage 51, projected end-of-day 136. Conservative period accounting **1,626/5,000**, routine remaining 3,024, no projected overrun. These are ledger counts, not a new provider-account query.

Forward forecast 121/day average, peak 196: **55.5% average / 27.9% peak reserve**. Earlier approved snapshot was 124/day, peak 196 against 273. Movement reflects fixture/time/usage inputs, not changed cadence. Exact cadence/backoff/dedup thresholds remain in the quota report.

All four identities appear in owner health and scheduler targets. Successful automatic new-source ingestion was observed. Provider 500/quota stops preserve stored odds until original expiry, then use eligible attributed insurance or unavailable. Suspension, explicit removal, expiry, kickoff/finished state or no valid source can remove usable odds; missing new-book prices are never fabricated.

## Gates and production QA

- **1,128 tests PASS**: 1,111 Vitest across 142 files + 17 validation tests.
- Typecheck, lint, production build, secret scan PASS after final CSS fixes.
- Remote production secret scan: 15 documents/assets, zero credential leaks; no client secret references.
- EN/PT-BR/ES-MX × light/dark × 320/390/430/1440 homepage matrix **24/24 PASS**, actual viewports verified, zero overflow, odds targets ≥44px. Final desktop width 45.55px with sponsor rail.
- Match Center odds targets ≥44px at all four widths. No logo/odds collisions. My Slip cards/dialog have zero horizontal overflow.
- Root, BR/MX/EN and football routes, Match Center, My Slip, 34/34 competition navigation, affiliate gating verified. Normal navigation/comparison providerRequests=0, no public provider gateway.
- Browser console: no errors/warnings observed. Runtime logs did show two transient Neon cache-revalidation connection timeouts at 08:50:41 and 08:51:57 UTC; responses remained HTTP 200. Later reads/navigation/health recovered. No provider retry spike. This is not a claim of zero historical infrastructure errors.

## Remaining limitations

REAL coverage varies by market/fixture; Sportingbet suspensions and Betsson BTTS gaps are disclosed. Tournament 329 returned 404 for both new books and is backed off. Two enabled competition identities remain unmapped in the existing OddsPapi catalog. New-book affiliate activation awaits approved configuration. Limited acceptance cannot prove indefinite uptime; transient DB revalidation failures remain an operational monitoring concern. No further milestone started.
