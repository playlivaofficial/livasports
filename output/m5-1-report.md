# LivaSports M5.1 — Odds Commercial Activation

Status: **IMPLEMENTATION + LOCAL QA PASS; MAIN RELEASE BLOCKED BY APPROVAL CHECK**. Continuous automation and commercial Betsson activation remain explicitly gated, not falsely reported as operational. M5.1 has not been deployed.

Base: main `1c93365`, verified equal to origin/main. Feature branch `codex/m5-1-odds-activation`, implementation commit `58d8725202ed391b81373e952218a30a4458b3b0`, pushed successfully. No M5 ingestion rerun, Sportmonks call, subscription change, timestamp correction or later milestone.

## Completed verification before release

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
| Odds ingestion/shared scheduler boundary | IMPLEMENTED; controlled proof PASS |
| Continuous production automation | **NO** — existing Vercel Hobby only supports daily cron; no linked LivaSports worker available |
| Last successful automated refresh | None; controlled refresh is not automation |
| Betano BR pricing | BR eligible when valid/fresh/pregame; never MX |
| Betano CTA | DISABLED — no confirmed approval/destination |
| Betsson BR / MX | GENERIC_UNVERIFIED; public gated |
| Betsson affiliate destination | NOT CONFIGURED |
| Operational affiliate GEOs | None |
| Real active CTA / two-public-book visual sample | NO SAMPLE; no fabricated activation |

Production-only scheduler secret was generated directly in the existing Vercel secret store, with automation explicitly false. No secret was printed or committed. No cron, service, plan upgrade or office scheduler was created.

## Final release evidence

- All final local gates passed: 6 Node tests, 189 Vitest tests (44 files), typecheck, lint, production build, secret scan and diff whitespace check.
- Final local protected health/auth/disabled-automation checks passed. Googlebot-style SSR, initial/repeat/mobile match loads, odds endpoint, locale switch and team/player reads passed. OddsPapi HTTP ledger remained 17 and Sportmonks cumulative accounting remained 262 throughout navigation: **normal navigation providerRequests=0**.
- Local server logs demonstrate odds-cache MISS → HIT and zero-provider navigation. The local QA server was stopped; no office scheduler is running.
- Main merge/push was rejected by the release safety reviewer before execution. It requires explicit confirmation in the conversation for the consequential main-branch publication. No workaround or indirect deployment was attempted.
- Main remains `1c93365caa98a23faadc55e6cd2a21cdee1270d5`, equal to origin/main. Feature code is preserved on GitHub. The following checkpoint/report-only commit records this blocked state; its hash can be resolved from the feature branch HEAD.
- Existing production is unchanged: `dpl_Fo8ySZAbv2usSq9HSECXMPdMe73p`, READY, main `1c93365`. **M5.1 production QA is NOT EXECUTED**, because its release was blocked. This existing M5 deployment is not presented as M5.1 success.
- Final M5.1 provider usage to this checkpoint: **2 HTTP calls, 1 billable + 1 unmetered; Sportmonks 0**. Both succeeded. No automated provider invocation occurred.

## Remaining activation actions

1. Explicit conversational confirmation to merge the prepared M5.1 feature into main, push main and deploy to the existing Vercel project. Then run the bounded production scheduler proof and full production QA before reporting release success.
2. Separately, user approval for a suitable commercial scheduler/hosting arrangement; configure a five-minute protected tick, then observe real automatic operation before claiming YES.
3. Explicit evidence that the paid Betsson feed is usable for the intended jurisdiction.
4. Actual approved Betsson destination/campaign and GEO. Betano CTA additionally requires its own affiliate approval.

Sources and full procedures: `docs/M5_1_ODDS_ACTIVATION.md`, `docs/M5_1_SCHEDULER.md`, `docs/M5_1_REQUEST_BUDGET.md`, `docs/M5_1_BETSSON_GEO.md`, `docs/M5_1_AFFILIATE_ACTIVATION.md`.
