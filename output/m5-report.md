# LivaSports M5 — Real Pregame Odds Ingestion & Comparison

## Status

Implementation and safe production release: **PASS**, with the operational limitations below. Deployment `dpl_HMhULj1vY1WeU2jPmnVwp1czapSU` is **READY** on `https://livasports.com`.

Operational scope is deliberately partial: real Betano BR prices are available to BR users after a controlled refresh. Real generic Betsson prices are ingested but not published as BR/MX coverage without jurisdiction evidence. No affiliate destination or continuous odds scheduler is configured. This is not a claim of a continuously operating two-bookmaker commercial launch.

## Implemented

- Replaceable OddsPapi adapter; soccer, pregame, the two paid feeds only. No live odds, player props, basketball, double chance, slip builder or later milestone.
- Exact canonical fixture mapping, reviewed contextual aliases, persistent provider mappings and unresolved-review evidence. Ten-minute tolerance is discovery-only; changed established kickoff signatures require reconciliation.
- Full-time regulation 1X2, goals over/under **2.5**, and BTTS. Other periods/lines/markets are rejected. Original decimal precision is retained in PostgreSQL; missing provider timestamps remain missing.
- Transactional batched current quotes and meaningful-change history, durable request reservations, verified subscription-period budget, bounded retry, worker lease, saved snapshots and quota-free recovery/replay.
- One bounded cold DB odds query, independent 15-second hard cache, no history lookup or provider request from navigation. Revalidation is visible-only and at most once per minute; the active browser removes expired prices and CTAs at expiry/kickoff.
- Localized PT-BR/ES-MX three-market comparison table, compact unavailable states, two-eligible-bookmaker-only best labels, conservative ties, server-validated affiliate boundary and minimal existing-event analytics.

## Verified data and coverage

Neon contains **34 enabled competitions, 42 seasons, 1,343 teams, 904 fixtures and 2,595 provider mappings**. M5 retains **651 current quote records** across **50 mapped fixtures**; after the final real observation, meaningful history is **1,022** rows. Snapshot replays do not grow history. Retained closed records are not counted as returned current selections.

Audited OddsPapi competitions are Brasileiro Serie A **325**, Liga MX Apertura **27464**, Premier League **17**, and Copa Libertadores **384**. Mapping is based on the returned catalogue, not an assumed Mexico ID.

| Feed | Fixtures returned | Complete scoped quotes | Common sampled fixtures | Public eligibility |
|---|---:|---:|---:|---|
| Betano BR | 39 | 273 selections / 39 fixtures | 50 | BR only |
| Betsson | 50 | 350 selections / 50 fixtures | 50 | Generic `.com` jurisdiction unverified |

All three markets are complete for the same covered fixtures in the final response: Betano BR 16/19 Brazil (84.2%), 18/20 Premier League (90%), 4/7 Liga MX (57.1%) and 1/4 Libertadores (25%); Betsson 19/19, 20/20, 7/7 and 4/4 respectively (100% completeness). Completeness is not active/fresh/GEO-eligible coverage. Active Betsson fixture counts are 13 Brazil, 6 Premier League, 4 Liga MX and 4 Libertadores; its jurisdiction remains unverified. There are **77 missing selections** in the common sample; exact fixture/market/outcome evidence and changing suspension/freshness counts are in `m5-coverage-report.json`.

The earlier Betano observation returned 44 fixtures/301 selections (43 complete). Its final successful response withdrew four previously priced fixtures; the worker closed **28 quotes** and added exactly one history transition each. A fifth previously empty fixture also disappeared. This is real changing coverage, not a matching failure or invented price. Replaying both final snapshots produced zero further writes/closures/history changes.

Mexico: real Liga MX fixtures/quotes exist internally, but **no MX bookmaker feed is jurisdiction-verified**. `/mx` intentionally shows localized no coverage. Betano BR pricing a Mexican match is not Mexican-user coverage.

## Kickoff correction safeguard

No global shift was performed. Two narrow Sportmonks requests verified 8 then 42 existing fixture IDs, UTC epoch/string agreement, competition, participants, roles and scheduled state before guarded writes.

Exactly **50 timestamps changed**: **46** consistent with the proven UTC parsing defect; **4** also differed from the current source schedule after accounting for that defect. The latter are Monterrey–Tigres (+10 minutes), Toluca–Atlas (+5), Santos Laguna–Juárez (+60), and Cruz Azul–América (+15). These are verified current-source differences; an independent historical rescheduling-event log was not available, so no historical reschedule cause is invented.

Both correction batches re-ran with **0 changes and 0 provider requests**. Canonical/public IDs and URLs stayed intact. The other **854 fixtures were not shifted or retrospectively certified**. All 50 corrected rows still matched their evidence and remained scheduled/upcoming in the controlled route audit. Five had incorrectly appeared past kickoff before correction; fresh Sportmonks evidence classified them scheduled. Live/finished statuses and scores were never inferred from clock alone or overwritten.

Odds stop at the earlier verified provider/canonical kickoff and when status ceases to be scheduled. A local browser-clock replay verified both stale expiry and post-kickoff removal; it did not change any data and is not evidence of a real live production match.

## Requests and automation

- OddsPapi: **15** requests total, including one 429 and its bounded retry; 11 audit requests plus 4 successful shared bookmaker refresh requests across two controlled runs. No live/props call.
- Sportmonks: **2** narrow diagnostic requests; no full M3.6/M4/profile re-ingestion.
- Normal route/market navigation: **0**. Both odds and sports request ledgers remained unchanged during the regression audit.
- Subscription baseline: 50 externally counted requests; all local calls counted again conservatively. Hard plan 5,000, internal stop 4,500, no new subscription or service purchase.
- `ODDS_INGESTION_IMPLEMENTED`: **YES**.
- `ODDS_AUTOMATION_OPERATIONAL`: **NO**. An external approved scheduler and subscription-period baseline reconciliation are still required. No office-computer process is represented as production automation.

## Integrity and quality gates

- Tests: **PASS — 6 Node + 156 Vitest tests (38 files)**.
- Typecheck, lint (zero warnings), production build, local secret scan: **PASS**.
- Migration 008 applied; subsequent migration run: **[]**, no reset or destructive operation.
- M5: duplicate/invalid/orphan quotes **0**, active jobs **0**, unapplied snapshots **0**, matched fixtures **50**.
- Latest saved-response replay: Betano BR and Betsson **0 current writes / 0 history changes / 0 closures**, no API calls.
- M4/M4.1 duplicate and product-orphan audits: **PASS**. Existing 134 non-product identity reservations predate M5 and are unchanged; they were not deleted or misclassified as new data corruption.
- Canonical counts and 34/34 BR/MX competition navigation preserved. Match Center and representative team/player routes, sitemap, canonical 308, real 404 and API invalid-input handling verified.
- M4 data retained: 32 scores, 70 events, 330 statistics, 174 lineups, 8 formations and 90 standings rows. M4.1 retained 253 players/mappings, 99 squad memberships, 122 team statistics, 26 player statistics and 131 fixture-player statistics.

## Rendered QA and performance

Actual Chrome pages inspected at **375, 390, 430, 768 and 1440 px**: no document horizontal overflow, broken team images or JavaScript exceptions; three market tabs fit. The existing standings table/section navigation keeps its intentional internal horizontal scrolling, not page overflow.

Real one-bookmaker, no-odds, stale, scheduled, finished and MX no-coverage states are inspected. Affiliate absence is verified. Two jurisdiction-eligible bookmakers, a single missing market, and a configured real affiliate CTA were **NO REAL SAMPLE**; eligibility/comparison/CTA/rejection behavior is covered by tests, not fabricated production prices or links. No test data was added to Neon.

Normal observed CLS **0**; active-page clock-expiry test CLS approximately **0.0049**. Warm local navigation sampled around 0.3–1.7 seconds; initial cold sample approximately 4.15 seconds including remote DB latency. Production full-match decoded JavaScript is **483,910 bytes** versus pre-release **477,118 bytes**: +6,792 bytes (~1.4%); encoded transfer 148,502 versus 145,977 bytes. No heavy table/chart dependency added. Independent odds cache MISS → SET → HIT observed; cold odds read is one DB query, hit is zero.

The computer-use skill guided actual rendered inspection rather than accepting HTTP status or test success as visual approval. Final screenshots are stored as `output/m5-local-*.png`. Explicit clock-replay filenames are local behavior tests, not live-data claims.

## Production release

- Existing project only: `nikapopkha3-4447s-projects/livasports`.
- Feature branch: `codex/m5-real-odds-comparison`; implementation commit **`74d0980d4930494170dc9c7b23f80328abae9a1f`**, pushed.
- Main merge: **`674e51032fd31b053b25da16cc724f9ed442bc06`**, pushed without force; main matched origin/main and was clean.
- Deployment **`dpl_HMhULj1vY1WeU2jPmnVwp1czapSU`**, **READY**, aliases include apex and www. Production build succeeded.
- Production route suite at 2026-09-12T11:57:54Z: **PASS**. Root redirect; all eight BR/MX list routes; 34/34 competition navigation; scheduled/finished BR/MX match pages; canonical stored kickoffs/status; team/player routes; sitemap; health; canonical 308; real 404; invalid API input 400; unconfigured affiliate redirect denied.
- HTTPS and `https://www.livasports.com/br` → `https://livasports.com/br` **308 PASS**.
- Actual production 390px 1X2/2.5/BTTS and MX no-coverage browser inspection: **PASS**, no horizontal page overflow, broken images, JS exceptions or application 5xx. Observed CLS 0; navigation about 1.0–2.05 seconds. Screenshots: `output/m5-production-*.png`.
- Provider ledgers before/after ordinary production QA: OddsPapi **15 → 15**; existing sports workers **262 → 262**. Provider calls from normal navigation **0**.
- Bounded production runtime capture: expected M3/M4/M4.1 cache diagnostics plus M5 **MISS → SET → HIT**, no unexpected warning/error in the captured window. CLI dependency deprecation notices are local tooling notices, not production runtime defects.
- Production secret scan: **10 HTML/bundle documents, 0 leaks**. No environment files, credentials, affiliate destinations or raw account evidence published client-side.
- Real production expiry: **PASS** at 2026-09-12T12:11:45Z. The same open 390px page started with three actual Betano prices, waited for the real 15-minute observation deadline, then displayed zero active prices and the PT-BR stale message. No reload, clock override, database mutation or provider request; no browser errors/5xx/overflow; CLS approximately 0.0049. Evidence: `m5-production-real-expiry-390.png`.
- The final coverage snapshot records **651 expired observations** after deliberate expiry; no scheduler was activated to disguise that limitation. The verified prices and timestamps remain auditable in Neon.
- A local repeat build initially encountered a Windows lock from the open QA browser profile under `.next`. QA profiles now use separately validated temporary directories. The browser completed safely; the final production build and secret scan re-ran **PASS**. No production code or data was affected by that local build interruption.
- No real live odds operation was tested or enabled. Post-kickoff/live/finished rejection is tested; real finished pages contain no active pregame prices. Local clock replay is explicitly distinguished from actual live operation.

## Remaining activation requirements

1. Verify the paid generic Betsson feed's actual BR/MX jurisdiction with the provider/affiliate contact before public comparison eligibility changes. No recommendation to buy additional bookmakers.
2. Configure a real approved jurisdiction-specific affiliate destination server-side before enabling any CTA. Affiliate approval alone is not a destination or GEO mapping.
3. Activate an approved budget-aware scheduler and reconcile the next account period before claiming continuous odds freshness.

No M6/M7/M8 scope is included.

The final release-evidence commit follows the implementation merge and contains only reports, screenshots and QA/report tooling. Application source and migrations remain identical to the deployment verified above. Its Git hash is resolved from final `main` rather than embedded self-referentially in this document.
