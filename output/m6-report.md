# LivaSports M6 — Bet Slip Builder Report

## Current status

Implementation and all local release gates complete on `codex/m6-bet-slip-builder`. No M7/M8 work. Production remains the existing M5.1 release until the safe merge/deployment completes; production evidence will be appended after verification.

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

M6 usage so far: **1 OddsPapi HTTP request (billable), 0 Sportmonks**. Controlled M5.1 job `9c167a89-3e2e-447e-bdbf-3e74ef4c94ea` requested Betano BR/Premier League tournament 17 once; 20 returned/matched fixtures, 140 quotes/current writes, 44 meaningful history changes, zero closures. Snapshot: **13:30:22.991 UTC**, original expiry **13:45:22.991 UTC**, September 12, 2026. No request was caused by browser interaction. Navigation audit: OddsPapi ledger **19→19**, cumulative Sportmonks **262→262**.

## Honest operational boundaries

Continuous odds automation **NOT operational** on current Hobby. Betano BR is BR-only; Betsson BR/MX stays GEO-unverified and gated. No affiliate CTA/destination was enabled. A valid guest slip can contain unavailable selections when prices expire. True simultaneous multi-tab writes are last-writer-wins; storage-denied mode is page-memory only. No real two-eligible-book sample is available. Live quote-change/kickoff replay is separate from real production observation.

## Release evidence

Pending final gates, safe feature push/main merge and existing-project deployment. Project must remain `nikapopkha3-4447s-projects/livasports` (`prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr`). Final hashes/deployment and production QA will be recorded here after verification.

Documentation: `docs/M6_BET_SLIP_BUILDER.md`, `docs/M6_SLIP_STATE_MODEL.md`, `docs/M6_M7_CONTRACT.md`, `docs/M6_UX_ACCESSIBILITY.md`.
