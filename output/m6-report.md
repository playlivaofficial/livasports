# LivaSports M6 — Bet Slip Builder Report

## Current status

**M6 COMPLETE — deployed and production verified.** Feature, regression, security, data-integrity and visual QA PASS, including a real-clock kickoff observation. No M7/M8 work and no implementation changes were needed after deployment.

## Product completed

- Versioned local guest intent, ten selections maximum, one selection per fixture, explicit replacement and multi-clear confirmation.
- Match Winner, Over/Under 2.5 and BTTS; pregame/full-time regulation only. Bookmaker-independent public fixture identity.
- Current/changed/stale/unavailable/suspended/closed/started/finished states, expiry/offline guards, recovery and no frozen actionable price.
- BR/MX relocalization and unchanged GEO/affiliate gates. No combined odds, placement, transfer, registration or advertising inside the slip.
- Batched DB/cache-only resolution, strict small input, bounded cache, restrained visible-only polling. Ordinary interactions cannot call either provider.
- Add/remove/replace/clear/open/invalidation analytics, best-effort and anonymous; additive migration 010.

## Local verification

- Node **6/6**, Vitest **242/242** across **49 files**; typecheck, lint and production build PASS. Secret scan: zero tracked environments, value leaks or client secret references; local public scan of ten documents found zero leaks.
- Real current Betano BR: keyboard add, selected state, replacement, ten unique fixtures and rejected eleventh, no persisted price/bookmaker/kickoff, refresh and cross-tab remove/clear PASS.
- Real BR→MX: ten intents preserved, zero BR prices in MX, localized no-verified-coverage state PASS.
- Empty/three-selection layouts at 375/390/430/768/1440; one, replace, ten, MX screenshots inspected. No horizontal overflow, broken images, JS exceptions or application 5xx.
- Actual SPA Match Center→team→player, back/forward and locale switching PASS. Tenth remove reachable and ≥44px controls at all five sizes; focus preserved.
- M3.6 route registry 34/34 both locales; existing Match Center, team/player, sitemap, canonical redirects and 404 checks PASS. Source-proven M5 kickoff corrections unchanged 50/50.
- Local failure/price-change/expiry/kickoff/suspension/closure/finish/missing/future-schema replay PASS. Four separate 61-second checks observed zero reads while offline, hidden, closed and empty; online recovery PASS. One intentionally injected local 503 is not a real production error. A replay is not real provider or live production evidence.
- Final gates repeated after fixes at 13:49 UTC: 248 total tests, typecheck, lint, production build, secret scan and diff check PASS. Protected scheduler regression PASS with zero refresh invocations after loading the existing ignored scheduler-secret file. The first local auth check failed because that file was not loaded, not because of a product change.

## Data safety and provider accounting

Migration `010_m6_slip_events.sql` applied additively; two subsequent migration passes applied nothing. No fixture/score/profile/odds schema reset or full ingestion. Existing canonical identities and timestamps preserved.

Audit **2026-09-12T13:44:40.160Z**: 34 enabled competitions, 904 fixtures, 1,343 teams, 253 players, 651 retained current quote rows, 1,113 history rows, 50 OddsPapi fixture mappings. Zero running odds jobs, pending snapshots, duplicate quotes/history, orphan quotes/history, invalid analytics fixture contexts or approved affiliate links. Retained rows are not a claim that those quotes remain fresh.

Read-only M4/M4.1 audit also preserved 42 seasons, 2,595 provider mappings, 32 scores, 70 events, 330 statistics, 174 lineups, 8 formations, 90 standings, 253 player mappings and 99 squad memberships. Duplicate canonical IDs/records and relational profile orphans are zero. The existing 134 unmaterialized provider identity reservations remain untouched; these are not newly created canonical orphan rows. Existing provider-limited sparse modules remain honestly unavailable.

Final M6 usage: **2 OddsPapi HTTP requests (both billable), 0 Sportmonks**. No request was caused by browser interaction.

1. Local controlled job `9c167a89-3e2e-447e-bdbf-3e74ef4c94ea`: Betano BR/Premier League tournament **17**, 20 returned/matched fixtures, 140 quotes/current writes, 44 meaningful history changes, zero closures. Snapshot **13:30:22.991 UTC**, maximum original expiry **13:45:22.991 UTC**, September 12, 2026. Local navigation ledger **19→19**, Sportmonks **262→262**.
2. Production controlled job `ff5fb5e1-a2b4-438c-8c0c-b936603e256e`: same approved feed/tournament, 19 returned/matched fixtures, 133 quotes/current writes, 30 price/status history changes and **7 authoritative withdrawn-quote closures**. Snapshot **13:53:09.040 UTC**. Original expiry is capped by kickoff, never extended by M6. Immediate duplicate job `dbfcb50d-9976-4b90-b25d-60fd4f0101e7` made **zero requests**. No full discovery/ingestion rerun.

Final audit at **13:56:49 UTC**: 34 enabled competitions, 904 fixtures, 1,343 teams, 253 players, 651 retained quote rows, **1,150 history rows**. History increased by exactly 44 local + 30 production changes + 7 closures from the M5.1 baseline of 1,069. Zero duplicate current/history rows, relational odds/profile orphans, invalid event contexts, running jobs or pending snapshots. Anonymous QA interactions create legitimate aggregate events, not user accounts or fake sports data. Repeating the exact same slip-open event twice returned 204 twice and persisted **one row**.

HTTP ledger total **20**, cumulative Sportmonks **262**; production normal-read ledger stayed **20→20 / 262→262**. Conservative billing accounting is **69 used**, **4,431 safe remaining** under the internal 4,500 ceiling (paid limit 5,000). Reserved requests zero. The last provider reconciliation remains 12:44:58 UTC; this is not a fresh claim about independent external account usage.

## Honest operational boundaries

Continuous odds automation **NOT operational** on current Hobby. Betano BR is BR-only; Betsson BR/MX stays GEO-unverified and gated. No affiliate CTA/destination was enabled. A valid guest slip can contain unavailable selections when prices expire. True simultaneous multi-tab writes are last-writer-wins; storage-denied mode is page-memory only. No real two-eligible-book sample is available. Live quote-change/kickoff replay is separate from real production observation.

## Release evidence and production QA

- Feature branch: `codex/m6-bet-slip-builder`; implementation commit **`a18d68b2c8ca2a392e63dfe7e0f8b58ebaab8d65`**, pushed to GitHub.
- Safe non-force main merge **`f10302987550c80546f63f30b7cb25f7fdc3a936`**, pushed; local main equals origin/main at deployment.
- Existing project only: `nikapopkha3-4447s-projects/livasports` (`prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr`). No project/subscription/hosting service created or upgraded.
- Production **`dpl_5TijVbugt78sarjKMW5NerH43pwr` — READY**, build PASS, exact merge commit above. GitHub integration performed the deployment; no redundant manual deploy. Aliases include `livasports.com` and `www.livasports.com`.
- The final follow-up contains reports, safe production screenshots and QA-only helpers; application/migration code remains the verified implementation. Its self-referential commit/deployment identifiers belong in Git/Vercel and the completion response.

| Production gate | Observed result |
|---|---|
| Apex / HTTPS / www | PASS; root 307 to /br, www 308 to apex preserving path |
| BR routes | /br, /br/futebol, /br/ao-vivo, /br/jogos/hoje PASS |
| MX routes | /mx, /mx/futbol, /mx/en-vivo, /mx/partidos/hoy PASS |
| M3.6 navigation | 34/34 canonical enabled competitions, including empty-window entries, both locales |
| M4 / M4.1 | Scheduled/finished Match Center, BR/MX teams/players, persisted modules and sitemap preserved |
| Canonical / invalid URLs | Wrong-slug 308, real missing BR/MX match 404, invalid odds identifier 400 |
| M5 / M5.1 | Three markets and exact mapping/GEO/expiry gates retained; protected health/auth and disabled automation checks PASS |
| Guest interactions | Real keyboard/pointer add, selected state, remove, explicit replace, multi-clear, ten limit and rejected eleventh PASS |
| Canonical markets | Real Match Winner, Over/Under 2.5 and BTTS; rapid repeat taps stay one selection |
| Persistence | Refresh, Match Center→team→player SPA, back/forward, competition/locale navigation and two-tab synchronization PASS |
| GEO | BR intent retained in MX with no BR price; no unapproved affiliate CTA or destination |
| Stale / missing / finished | Real saved BR stale selections and missing/finished resolver samples retain intent without price |
| Natural kickoff cutoff | PASS at 14:00:00.538 UTC: real saved selection became MATCH_STARTED, price disappeared, intent retained; no clock override or provider request |
| Price change / suspension | Full local rendered replay and unit coverage PASS; no forced production price change or two-book eligibility was fabricated |
| Desktop/tablet/mobile | Empty/three/ten layouts at 375/390/430/768/1440; no horizontal overflow; tenth remove and ≥44px targets reachable |
| Runtime/browser | No browser exception, broken image or application 5xx; production HTML/JS scan of 11 documents found zero credential leaks |
| Provider calls | Ordinary route/slip actions **0** in browser network inspection, server logs and before/after DB ledgers |
| Data safety | Migration repeat no-op; anonymous event duplicate idempotent; canonical data and provider identities preserved |

Runtime-log window ended **13:57:44 UTC**: **1,316 entries**, zero unexpected warnings/errors. The broad first diagnostic filter matched the successful scheduler's `error:null`; inspection confirmed it is not an error. Thirty cache keys were observed with both MISS and HIT; 257 ordinary cache misses, 92 hits, 68 deduplications, 17 odds misses and 5 odds hits. Nineteen slip-resolution log entries all recorded providerRequests=0; no normal-read nonzero request entry. Existing M3/M4/M4.1/M5 cache paths remain healthy.

Final gate repeat including QA helpers: **248 tests**, typecheck, lint, production build and secret scan PASS at 13:58 UTC. Real production match decoded JS: 506,152 bytes; local equivalent 505,528. No new runtime dependency. Representative production one-selection CLS about 0.051; three/ten screens 0.

Production screenshots include `m6-production-three-1440.png`, `m6-production-three-375.png`, `m6-production-ten-390.png`, `m6-production-replace-390.png`, `m6-production-btts-390.png`, `m6-production-mx-saved-390.png`, and `m6-production-player-persistence-390.png`. Prices are capture-time evidence, not a claim they remain valid now.

### Real-clock boundary and completion

The production browser held fixture **`3383b74df62a41b2`** through its actual **2026-09-12 14:00:00 UTC** pregame cutoff. At **14:00:00.538 UTC**, the open slip showed **MATCH_STARTED**, zero prices and one retained canonical selection. No date/time override, synthetic response or provider fetch was used. Six DB/cache-only slip reads occurred during the observation; browser provider requests, exceptions and 5xx were zero. Mobile width 390px had zero overflow and CLS about 0.017. Before/after screenshots: `m6-production-natural-boundary-before-390.png` and `m6-production-natural-boundary-after-390.png`.

This proves the real **pregame clock boundary**, not an observed live-score update or continuous live automation. Price changes/suspension and unobservable edge transitions were tested in the explicitly labelled local replay, not fabricated on production. Already expired real BR intentions were also rendered as stale with no price.

No release blocker or remaining M6 visual defect was found. The local QA server and isolated browser sessions were stopped. Application and database code have no difference from the fully verified main merge; final evidence-only publication does not change the product. Continuous odds automation, additional GEO eligibility and approved affiliate destinations remain the previously documented external activation limitations, not silently enabled M6 features. **Stop after M6.**

Documentation: `docs/M6_BET_SLIP_BUILDER.md`, `docs/M6_SLIP_STATE_MODEL.md`, `docs/M6_M7_CONTRACT.md`, `docs/M6_UX_ACCESSIBILITY.md`.
