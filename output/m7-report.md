# M7 — Full Slip Comparison release report

**M7 COMPLETE — implemented, pushed, safely merged, deployed READY and production verified. Stop after M7.**

Branch: `codex/m7-full-slip-comparison`. Initially audited/fetched base: `2ccb82ffda11ad62c41339ffd371be38effea900`. Correct GitHub account access was restored and verified with successful fetch/push operations. No reset/reclone or discarded user work.

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

Pre-release real-data browser checks used the actual application read endpoint and persisted sports data. Only local telemetry was isolated while migration 011 was pending release; actual analytics SQL/schema was verified in the rolled-back DB rehearsal. Production browser QA uses real data and real telemetry, with no response interception. Current production quotes now provide additional complete/partial/tie evidence, described below. Replays are never presented as production prices.

Visuals inspected at 375/390/430/768/1440. No horizontal page overflow, broken images or JavaScript exceptions. Comparison jumps and keyboard focus preserve the fixed header/footer. Real ten-selection CLS about 0.00064; replay expiry/kickoff CLS about 0.01223. Same-page initial JS payload increased about 11.1 KB uncompressed (about 1.8%); no new runtime dependency. A warm ten-selection request was 10 ms. Cold local request including connection/network was 2.17 s; warm-pool DB/cache rehearsal was about 625 ms across two queries. The current-quote SQL execution plan is saved in ignored QA evidence; there is no per-selection query loop. Repeat reordered selection set uses zero new DB queries.

## Data safety / automation

Final pre-release rehearsal at 2026-09-12 19:11 UTC preserved 34 competitions, 904 fixtures, 1,343 teams, 253 players, 651 retained current-quote rows and 1,150 history rows. Zero running odds jobs, pending snapshots, duplicate/orphan quotes. All 50 source-confirmed kickoff corrections remain exact. Provider ledgers remain 20 OddsPapi HTTP records / 262 historical Sportmonks requests. M7 has made no provider request before release.

One bounded controlled refresh was subsequently run for production price verification, through the existing scheduler and budget controls. Job `e5745519-81e5-44e0-94bd-11564d59ba1e` SUCCEEDED with exactly two OddsPapi requests and zero Sportmonks requests. It refreshed 217 Betano quotes and 252 Betsson quotes, recorded 273 meaningful quote-history changes and closed 140 withdrawn quotes. Existing current rows remain 651; history becomes 1,563. Ordinary interaction ledgers remain unchanged at 22 OddsPapi HTTP records / 262 historical Sportmonks requests after this controlled job. No pending snapshots, running jobs, duplicate or orphan current/history quotes remain.

Protected production health verified at 19:23:52 UTC: automationEnabled=false, automationOperational=false, lastSuccessfulAutomatedRefreshAt=null, activeLease=null. Continuous automation remains **NOT operational** on current Hobby. The controlled refresh does not change that status. No scheduler was created, provider purchased or hosting upgraded. Original 15-minute freshness remains authoritative; without another legitimate refresh, the captured prices expire. Budget audit remains verified, used 71, reserved 0, safe remaining 4,429 within the existing internal limit.

## Release / production evidence

| Release item | Verified result |
|---|---|
| Feature branch | `codex/m7-full-slip-comparison`, pushed |
| Implementation commit | `9cd1402094c852eca93dab865901eb91703bcc03` |
| Safe main merge | `4c7b3cbdd2e774d130d313fc3b85ed979b8752c8`, pushed |
| GitHub identity | `playlivaofficial`; stale `nika1578` was not used |
| Main synchronization at release | Local main equals origin/main; clean working tree |
| Migration 011 | Applied once to existing Neon; immediate second run returned no migrations |
| Application deployment | `dpl_YyEwYrRKeGDGFYNMqi3TXDfeyXYo`, READY, exact merge SHA verified |
| Existing Vercel project | `nikapopkha3-4447s-projects/livasports` |
| Project / team | `prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr` / `team_rtsOqa3gRkQZwndpkXwyMDno` |
| Production | https://livasports.com; www redirects to HTTPS apex |

GitHub integration deployed the synchronized main automatically to the existing project; no duplicate project or manual duplicate deployment was needed. Subsequent changes are QA helpers, screenshots and this release evidence; application source remains identical to the verified release merge. The containing evidence commit and its final exact production deployment are verified again before task completion.

### Production QA

- Complete M3–M6 route regression passed: root/locales, all 34 competition navigation entries in both locales, Match Center, team/player profiles, canonical redirects, invalid routes, sitemap, healthy application/DB and HTTPS www redirect. All 50 source-confirmed kickoff corrections remained exact. Provider ledger delta was 0/0.
- M7 HTTP suite: 17 checks PASS for ten real canonical picks, strict validation, current-only totals, locale isolation, private/no-store, safe outbound fallback, arbitrary redirect rejection and zero provider delta.
- Real browser regression: 27 checks PASS across 375/390/430/768/1440, fixed header, tenth-selection removal, 44px targets, focus, SPA team/player/back/forward persistence, MX relocalization and localized outbound-failure recovery. No JavaScript errors, unexpected 5xx, broken images or page overflow.
- Real current-price endpoint audit: 24 checks PASS. It found 26 exact selections covered by both books and ten selections covered by one. Independent rational arithmetic checked the endpoint products and price-only winners. One, three and ten selections, a real tie, a real partial bookmaker, reordered results and MX isolation passed. A repeated production analytics event returned 204 twice and persisted exactly once.
- Real current-price browser: 17 checks PASS, using actual production responses and telemetry. Both bookmakers' displayed totals and best/tie labels match independently calculated expected values. Eight additional screenshots cover one/three/ten/partial and every required width. CLS was 0 in these captures.
- Existing M6 real-interaction suite against deployed M7: 42 checks PASS. Real Match Center buttons support keyboard add and confirmed replacement, ten saved picks and a rejected eleventh, selected button state, refresh/profile/navigation persistence, MX recalculation, two-tab removal/clear synchronization and recovery from corrupt storage. All five widths passed. The M7 artifact prefix preserves historical M6 screenshots.
- Real production expiry before/after verification: 7 checks PASS. Both initially complete books become incomplete with null totals and no best labels; all three saved canonical selections remain. Final stale capture has no overflow, broken images, runtime failures or provider requests. The elapsed-kickoff check independently passes against real production fixtures.
- Final production HTML/JS secret scan: BR Match Center 11 documents and MX 10, zero credential-value leaks, zero client secret references or tracked environment files.
- Final DB/application audit: 34 competitions, 904 fixtures, 1,343 teams and 253 players retained; migration 011 present exactly once; zero invalid analytics contexts, pending snapshots or running jobs. Real elapsed-kickoff selections return MATCH_STARTED, no price, no total, no best badge. Actual view/complete/partial/best events are persisted with aggregate context only.

### Real price evidence at 2026-09-12 19:23–19:24 UTC

These are timestamped QA observations, not enduring current-price claims. The same three full-time selections were used for each bookmaker: public fixtures `aded22c4035e4296` (Over 2.5), `ab713a1700c44974` (BTTS Yes), `be30c2fca15d4796` (Home).

| Real slip | Betano BR | Betsson | Correct result |
|---|---|---|---|
| One selection | 2.15 | 2.15 | Explicit tie |
| Same three selections | 2.15 × 1.57 × 2.82 = 9.51891 | 2.15 × 1.55 × 2.72 = 9.0644 | Display 9,52 vs 9,06; Betano best |
| Same ten selections | 937.54892409770592 | 852.1505369549139968 | Display 937,55 vs 852,15; Betano best |
| Real partial sample | 2/3, null total | 3/3, 12.33025 | Betsson 12,33; no best badge with only one complete book |

Both complete books reported AFFILIATE_UNAVAILABLE and outbound NONE: Betsson approval true/destinationConfigured false; Betano approval false/destinationConfigured false. The approved Betsson destination is not yet available in this local environment. Active approved-destination behavior and sponsored attributes were verified only in explicitly labeled local replay; no fake production destination was inserted.

The production ten-selection request took 218 ms and its reordered repeat 190 ms end to end from this host. Local instrumentation proves the bounded two-query MISS and zero-query HIT/DEDUP behavior; production response timings are not mislabeled as server DB timing. Same application JS impact remains approximately +11.1 KB uncompressed / +1.8%, with no new runtime dependencies.

Safe rendered evidence is tracked under `output/m7-production-*.png` and `output/m7-m6-production-*.png`. Detailed JSON, SQL plans, deployment metadata and provider accounting remain in ignored local QA files, without secret values being printed.

The held-open production browser began with both books complete and naturally removed expired pricing. The first intermediate timing assertion used the host wall clock and missed the seven-second separation: production server time was measured 28.4 seconds ahead of this computer. Both books were correctly stale by that local checkpoint. This was a QA timing error, not an application defect; the application already anchors expiry to server time plus monotonic elapsed time. The QA runner now uses the same calibrated reference and preserves failure diagnostics. The final real before/after expiry audit passed at host 19:38:59 UTC, with both totals null and saved intent intact. The exact intermediate staggered transition is covered by controlled local clock replay, not claimed as captured production evidence. No additional provider refresh or fabricated production data was used to work around this observation.

Final accounting at host 19:39:02 UTC remains 22 OddsPapi HTTP records / 262 historical Sportmonks requests, including only the two explicitly identified M7 controlled-refresh calls. All production analytics contexts remain valid. Local QA server and temporary browser profiles are stopped/closed after verification. Final publication verifies the evidence-only main commit against origin/main, READY deployment and the apex alias; immutable final IDs are included in the task completion message.

The only commercial configuration limitation is the locally unavailable approved Betsson destination. It does not block M7 under the owner's explicit follow-up. No M8 work is authorized or started.
