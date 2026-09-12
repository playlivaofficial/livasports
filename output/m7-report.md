# M7 — Full Slip Comparison release report

**Local implementation and all pre-release quality gates PASS. Release in progress.**

Branch: `codex/m7-full-slip-comparison`. Audited base and freshly fetched main: `2ccb82ffda11ad62c41339ffd371be38effea900`. Correct GitHub account access was restored and verified with a successful fetch. No reset/reclone or discarded user work.

## Product

- Exact M6 public fixture/market/outcome/line/full-time selection model; one pick per fixture, maximum ten, canonical persistence unchanged.
- Per-bookmaker required/available counts, missing and invalid selections, full selection quotes and exact combined decimal string. No incomplete or mixed-bookmaker totals.
- BigInt coefficient/scale math preserves individual precision; locale-aware two-decimal final display. Highest exact combined price wins only among at least two complete bookmakers; ties are explicit. Affiliate status never affects ranking.
- Betsson BR odds and affiliate approval confirmed by owner. Generic Betsson feed naming no longer denies BR pricing. The approved destination is not yet available in this local environment; its CTA stays configuration-gated without reducing odds eligibility.
- Betano BR odds eligible independently of affiliate approval; no CTA until real approval/destination exists. MX remains independently gated; neither BR feed is inherited.
- Known expiry/kickoff timers, server and browser revalidation, no stale total, no provider call on read/refresh/mobile/CTA. Outbound is a securely revalidated general HOMEPAGE destination when configured, otherwise NONE. No prefilled-slip claim, stake/payout calculator or M8 work.
- Stacked PT-BR/ES-MX cards, visible missing-selection details, keyboard controls, restrained best/tie labels and existing M6 add/remove/replace/clear/persistence.

## Pre-release verification

| Gate | Result |
|---|---|
| All Node tests | 6/6 PASS |
| All Vitest tests | 301/301 across 53 files PASS |
| Typecheck / lint / production build | PASS, Next.js 16.3.4 |
| Math / identity / completeness / GEO / affiliate / cache tests | PASS |
| Local controlled browser replay | 102 checks PASS |
| Real-data local browser | 27 checks PASS |
| M7 real-data HTTP | 17 checks PASS |
| Additive migration / real DB rehearsal | 14 checks PASS, rolled back |
| M3–M6 regression | 34/34 competition navigation both locales, Match Center, team/player, sitemap, canonical/invalid routes, three M5 markets, legacy M6 resolver PASS |
| Secret scan | Zero repository/client credential exposure; local Match Center 11 documents, MX 10 and current-production BR 10 scanned with zero leaks |
| Provider audit | Ordinary interaction delta 0 OddsPapi / 0 Sportmonks |

Replay covers empty/one/three/ten, both complete, either partial, one complete, zero coverage, stale, suspended, started, tie, price change, exact clock expiry, kickoff, active test Betsson CTA and absent Betano CTA, long names, huge decimal values, MX, keyboard add/replace, rejected eleventh, focus/remove/clear and two-tab synchronization. Four independent 61-second observations prove no polling while offline, hidden, closed or empty; online recovery works. One intentionally injected local 503 tests failure handling; there are no unexpected application failures. Replays are visibly labeled synthetic and never written to the database.

Real-data browser checks use the actual application read endpoint and persisted sports data. Only telemetry is isolated while migration 011 is pending release; actual new analytics SQL/schema was verified in the rolled-back DB rehearsal, including UUID idempotency and compatibility with M6 events. Real-data price samples were stale/unavailable; replay prices are not presented as current production evidence.

Visuals inspected at 375/390/430/768/1440. No horizontal page overflow, broken images or JavaScript exceptions. Comparison jumps and keyboard focus preserve the fixed header/footer. Real ten-selection CLS about 0.00064; replay expiry/kickoff CLS about 0.01223. Same-page initial JS payload increased about 11.1 KB uncompressed (about 1.8%); no new runtime dependency. A warm ten-selection request was 10 ms. Cold local request including connection/network was 2.17 s; warm-pool DB/cache rehearsal was about 625 ms across two queries. The current-quote SQL execution plan is saved in ignored QA evidence; there is no per-selection query loop. Repeat reordered selection set uses zero new DB queries.

## Data safety / automation

Final pre-release rehearsal at 2026-09-12 19:11 UTC preserved 34 competitions, 904 fixtures, 1,343 teams, 253 players, 651 retained current-quote rows and 1,150 history rows. Zero running odds jobs, pending snapshots, duplicate/orphan quotes. All 50 source-confirmed kickoff corrections remain exact. Provider ledgers remain 20 OddsPapi HTTP records / 262 historical Sportmonks requests. M7 has made no provider request before release.

Production protected health verified at 19:05:53 UTC: automationEnabled=false, automationOperational=false, lastSuccessfulAutomatedRefreshAt=null, activeLease=null. Continuous automation remains **NOT operational** on current Hobby. No refresh invoked, scheduler created, provider purchased or hosting upgraded. Original 15-minute freshness remains authoritative.

## Release / production evidence

Pending authorized feature commit/push, additive migration, safe main merge/push and production deployment verification. Existing Vercel project is `nikapopkha3-4447s-projects/livasports`, ID `prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr`, team `team_rtsOqa3gRkQZwndpkXwyMDno`. Before release its production deployment is `dpl_EhtGB3iSTBKfTGMwvGZvct6aiVLN`, READY at the M6 base commit. Final release hashes/deployment and production QA will replace this section after verification.

The only commercial configuration limitation is the locally unavailable approved Betsson destination. It does not block M7 under the owner's explicit follow-up. No M8 work is authorized or started.
