# LivaSports M5.1 — Odds Commercial Activation

2026-09-12. **RELEASED — guarded implementation and production QA verified; commercial activation remains PARTIAL.** Continuous automation is NOT operational. Betsson GEO and affiliate destinations remain gated, not falsely reported as operational. The earlier main-release approval block was resolved by the user's explicit final approval.

Base: main `1c93365`. Feature branch `codex/m5-1-odds-activation`, implementation `58d8725202ed391b81373e952218a30a4458b3b0`, final feature checkpoint `ae853b7cf252978415ffd040e3bd2d696a659b34`, both pushed. Main release merge **`846577113c189a721ea66ae5855ef8b7b4c7d2fc`** pushed and synchronized with origin/main. No force-push, M5 ingestion rerun, Sportmonks call, subscription change, timestamp correction or later milestone.

## Completed local verification before release (historical pre-production counts)

- Additive migration 009 applied; second migration run executed no changes.
- Controlled authenticated local production-build scheduler succeeded at 12:45 UTC on 2026-09-12: **2 HTTP calls = 1 unmetered account check + 1 billable Betano odds batch** for Premier League tournament 17.
- Returned/matched 18 real fixtures, 126 quotes; 25 meaningful price/status history changes. No withdrawal occurred in this response; existing closure/idempotency behavior was retained.
- Immediate repeat: zero provider calls. Duplicate active lease rejected; saved snapshot replay twice: zero quote/history/closure writes. No unfinished job/snapshot.
- DB: 34 enabled competitions, 904 fixtures, 50 OddsPapi fixture mappings, 651 retained quotes, 1,047 meaningful history rows. Duplicate current/history and relational orphan odds: zero.
- Billing window September 2–October 2, 2026, 11:10:51 UTC. Provider reported 64 at account check; conservative internal accounting after the odds request 66, safe remaining 4,434. Historical M5 failed attempts remain counted.
- Scope inventory: 68 upcoming fixtures (Série A 19, Liga MX 25, Premier League 20, Libertadores 4). Budget forecast and 3,415-call conservative 30-day planning envelope documented; routine 4,000/internal 4,500/paid 5,000 ceilings.
- Final local gates: Node 6 + Vitest 189 tests (195 total), typecheck, lint, production build and secret scan PASS. No ignored environment or credential value is tracked.
- Local route QA passed: BR/MX 34/34 navigation, Match Center, profiles, sitemap, redirects/404, exact preserved kickoff identities. Navigation ledger unchanged: OddsPapi 17 HTTP records, Sportmonks cumulative 262.
- Real rendered Betano-only prices inspected at 375/390/430/768/1440; all three markets, no document horizontal overflow, broken image, app 5xx or JS exception. BR stale and MX no-coverage states are honest and CTA-free.
- Real scheduled header, finished match and no-odds match also passed at 390px. A labeled +90-minute browser-only clock replay on the real Chelsea fixture withdrew all prices at kickoff, without changing the database or claiming an observed live match. Document overflow remained zero; replay CLS 0.0056, normal CLS 0.
- The first local server was unable to reach Neon inside restricted execution; restarting that exact server with authorized database networking resolved it. These rejected local checks consumed zero provider requests. No product-data workaround was applied.

## Real activation status

| Capability | Actual result |
|---|---|
| Odds ingestion/shared scheduler boundary | IMPLEMENTED; controlled local and production proof PASS |
| Continuous production automation | **NO** — existing Vercel Hobby only supports daily cron; no linked LivaSports worker available |
| Last successful automated refresh | None; controlled refresh is not automation |
| Last controlled production refresh | Snapshot 2026-09-12 12:57:24.482 UTC; job completed 12:57:24.643 UTC |
| Betano BR pricing | BR eligible when valid/fresh/pregame; never MX |
| Betano CTA | DISABLED — no confirmed approval/destination |
| Betsson BR / MX | GENERIC_UNVERIFIED; public gated |
| Betsson affiliate destination | NOT CONFIGURED |
| Operational affiliate GEOs | None |
| Real active CTA / two-public-book visual sample | NO SAMPLE; no fabricated activation |

Production-only scheduler secret was generated directly in the existing Vercel secret store, with automation explicitly false. No secret was printed or committed. No cron, service, plan upgrade or office scheduler was created.

## Final release evidence

- Existing Vercel project only: `nikapopkha3-4447s-projects/livasports` (`prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr`).
- **`dpl_7b5KdHUSDGSer2cphzVQdNQpAKjM` — READY**, production commit `846577113c189a721ea66ae5855ef8b7b4c7d2fc`. Full QA below was executed against this deployment. GitHub integration deployed main; no redundant manual deployment or new project was created. Production aliases include `livasports.com` and `www.livasports.com`.
- All final local gates passed: 6 Node + 189 Vitest tests across 44 files (**195 total**), typecheck, lint, production build, secret scan and diff whitespace check. No implementation changes followed these gates.
- This report/checkpoint and production screenshots are the final evidence-only follow-up to the verified application merge. Its publication hash/deployment are recorded in Git/Vercel and the completion response; a report cannot contain its own commit hash.
- No office scheduler, stale worker or local QA server is left running. No service was purchased/upgraded and no unrelated project was changed.

### Controlled production proof and final accounting

At 12:57 UTC, authenticated production job `a56d5f8c-5b0e-4384-aeb3-d274b1996531` succeeded with **one billable** Betano request batching tournaments **325 and 27464**: 20 returned/matched fixtures, 140 quotes/current writes, 22 meaningful history changes and zero closures. Its immediate repeat `697aa66e-17a6-4200-a69e-d87ee8b7eb15` made zero provider calls. These are combined batch counts, not a claim of full Liga MX odds coverage or Betano eligibility for Mexican users.

**Final M5.1 usage: 3 HTTP calls = 2 billable odds requests + 1 documented unmetered account check; Sportmonks 0.** All returned HTTP 200; no M5.1 upstream retry/failure. No automated invocation occurred.

The verified subscription window remains September 2–October 2, 2026, 11:10:51 UTC. Provider-reported usage was 64 at reconciliation; conservative external baseline 50 and historical charged/failed M5 attempts remain preserved. Final internal usage **67**, safe remaining **4,433** below the internal 4,500 limit; routine remaining 3,933 below 4,000. Paid limit is 5,000. Reserved requests zero. The HTTP ledger has 18 records: 17 conservatively counted and one unmetered. This is not a fresh assertion about independent external use after reconciliation.

Updated conservative planning envelope: 67 known + 3,000 maximum rolling routine allocation + 350 reserve = **3,417/30 days**. The original frozen-inventory simulation predicted 641 future billable calls, maximum 71/day; future fixture arrivals were not fabricated. The 68-fixture inventory and 50 existing odds mappings are not interchangeable coverage counts.

### Final database and idempotency audit

Audit at **2026-09-12T12:59:40.510Z**:

| Entity / check | Count |
|---|---:|
| Enabled canonical competitions | 34 |
| Canonical fixtures | 904 |
| OddsPapi fixture mappings | 50 |
| Retained current quote rows | 651 |
| Meaningful history rows | 1,069 |
| Running jobs / unapplied snapshots | 0 / 0 |
| Duplicate current quotes / history | 0 / 0 |
| Orphan current quotes / history | 0 / 0 |
| Approved affiliate links | 0 |

Retained quote rows do not imply currently fresh public prices. History increased from 1,022 at M5 by exactly 25 local + 22 production meaningful changes. Migration 009 was additive and repeated as a no-op. Two post-production saved-response replay passes produced **zero current writes, history changes and closures**, with zero provider calls. Duplicate active lease was rejected. Existing canonical/public identities were preserved; the 50 source-proven M5 kickoff corrections still match their evidence exactly. No global shift or DB reset occurred.

### Production QA

| Verification | Result |
|---|---|
| Deployment / production build | READY / PASS |
| HTTPS, apex and www | PASS; root 307 to /br; www 308 to apex with path preserved |
| BR routes | /br, /br/futebol, /br/ao-vivo, /br/jogos/hoje PASS |
| MX routes | /mx, /mx/futbol, /mx/en-vivo, /mx/partidos/hoy PASS |
| Competition navigation | 34/34 canonical entries in both locales; zero-fixture entries retained |
| Match Center | Scheduled, finished and missing-odds samples; persisted kickoff/status and existing events/statistics/lineups preserved |
| Profiles / sitemap | BR/MX team/player routes and match/team/player sitemap entries PASS |
| Canonical / invalid routes | Wrong slug 308; missing BR/MX matches 404; invalid odds UUID 400 |
| M5 comparison | Three canonical markets preserved; no ineligible MX, finished or expired active prices |
| Scheduler boundary | Unauthenticated health/refresh 401; authenticated health 200; target query 400; disabled automatic GET 503; bounded controlled POST 200 |
| Cache | Observed MISS → HIT; repeated, Googlebot-style, mobile and locale-switch reads DB/cache-only |
| Normal navigation provider calls | **0**; OddsPapi ledger stayed 18, cumulative Sportmonks accounting stayed 262 across route QA |
| Affiliate / secrets | No unapproved CTA; unconfigured outbound route 404; production scan of 10 HTML/JS documents found zero leaks |
| Browser QA | Real BR 390/430/1440, MX 390 and both home pages 390; no document overflow, JS exception, broken image or app 5xx |
| Real expiry | PASS: held production Chelsea page through its 13:00:00.414 UTC expiry; three visible prices became zero and localized stale state appeared, without a provider call or clock override |
| Runtime logs | **PASS WITH OBSERVATION**, not an error-free claim: one transient existing profile-cache DB connection timeout; subsequent targeted BR/MX requests served correct content and cache hits without repeated error |

The initial captured log window contained 362 entries and one background revalidation error for the existing Pumas UNAM profile at approximately 12:59 UTC. The affected BR/MX pages subsequently returned correct profile titles/content and repeated 200s, with successful cache set/hit events. No scheduler failure, data loss, browser error or persistent route failure was found. No speculative DB/client architecture change was made to hide this infrastructure observation.

Production screenshot evidence: `m5-1-production-br-390.png`, `m5-1-production-br-1440.png`, `m5-1-production-br-btts-430.png`, `m5-1-production-mx-390.png`, `m5-1-production-br-home-390.png`, `m5-1-production-mx-home-390.png`, `m5-1-production-natural-expiry-390.png`. Fresh-price screenshots are capture-time evidence, not a claim that those snapshots remain fresh now. Real expiry CLS was approximately 0.0056 with zero page overflow.

## Remaining activation actions

1. Separate user approval for a suitable commercial scheduler/hosting arrangement; configure a five-minute protected tick, then observe real automatic operation before claiming YES. Until then prices honestly expire and **ODDS_AUTOMATION_OPERATIONAL=NO**.
2. Explicit evidence that the paid Betsson feed is usable for the intended jurisdiction.
3. Actual approved Betsson destination/campaign and GEO. Betano CTA additionally requires its own affiliate approval.

These are real activation requirements, not unresolved approval for this guarded release. M5.1's safe release is complete; unrestricted commercial activation is not. No M6/M7/M8 work was started.

Sources and full procedures: `docs/M5_1_ODDS_ACTIVATION.md`, `docs/M5_1_SCHEDULER.md`, `docs/M5_1_REQUEST_BUDGET.md`, `docs/M5_1_BETSSON_GEO.md`, `docs/M5_1_AFFILIATE_ACTIVATION.md`.
