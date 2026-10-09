# P0 odds reliability — incident and release evidence

## Current strict-selection release — 2026-10-09

Status: strict-selection implementation RELEASED and production acceptance PASS; native coverage remains PARTIAL and overall data health CRITICAL, not universally repaired. Baseline `a282e36a036eac6e4c71df8181bdc6237920f287`, feature `7d49aa0f96590de6fd326da252b99be9b2d62f5f`, PR #54, implementation main `6bd2053178722acad61dcd2251255b144748f1c0`. Existing Vercel deployment `dpl_G93QyJDVUiCA7DEjk5C95hDeiY3B` READY/Current at 10:05:41 UTC; apex `/api/internal/health` returned that exact release commit. Original unrelated dirty workspace is preserved. Historical October 1 sections below are archival, not the current account/operator/product scope.

Implemented frontend/server strict REAL-price admission, signed canonical quote binding, refresh/reprice/expiry suspension, explicit alternative confirmation, independent per-fixture locking, async clear/remove/replace protection, direct API and affiliate rechecks. Removed unpriced/foreign-reference admission; retained informational provenance, existing GEO/owner/session/affiliate rules, quota/cadence and DB/cache navigation. No migration required; existing latest migration is `068_pe_1xbet_affiliate_host.sql`.

Read-only audit at 08:17 UTC: acquisition matrix 32 competitions × 3 GEOs, 277 seven-day fixtures per GEO; native availability MX 134/277, CO 179/277, PE 185/277. These are timestamped baseline observations, not universal odds guarantees. Entitled local sources: MX Betsson; CO Betsson/bwin; PE Inkabet/1xBet. No available secondary feed was invented or bought. All direct/ordinary navigation provider requests remain zero.

Missing-odds evidence: saved Betsson/Inkabet Aldosivi–Sarmiento prices are explicitly SUSPENDED; bwin/1xBet prices are ACTIVE. CO therefore offers bwin, PE can offer 1xBet, MX must lock this fixture. Galatasaray's last saved odds are six days old and not current. Al Fateh–Al Ahli and Boyacá Chicó–Cúcuta had verified participant-name mapping gaps; scoped aliases repair these. Envigado–Internacional Palmira also matches deterministically but canonical status is POSTPONED, so it remains locked.

Three-event saved-response rehearsal, eight feed/event payloads, executed twice in a transaction and rolled back: first pass 77 GEO current/history writes, repeat pass 0 current/history writes, provider requests 0. Original provider observations were preserved (2026-10-08 13:50–21:05 UTC). No canonical fixture IDs, scores or kickoff times were changed. Provider-side suspensions/absences and genuinely ambiguous Conference League identities remain explicit limitations, not reasons to fabricate prices.

Health correction: persisted approved budget-paced deadlines now drive refresh-overdue reporting; no cadence/TTL/quota change. Explicit expired-quote and mapping-error regressions remain unhealthy. Budget baseline: 5000 monthly cap, 325 used, UTC-day 6/179, rolling 24h 60, routine headroom 83; expected 77/day versus routine forecast target 134, 57% reserve. These baseline counts include existing automatic activity; this task has consumed 0 provider calls so far.

Local browser: genuine bwin 2.50 admission retained exact bookmaker; suspended Betsson outcomes had no controls. Hydrated comparison remained incomplete for Betsson and complete for bwin with no unauthorized CTA. Mobile 375/390/430px overflow 0 and odds targets 44px.

Release gates: final full suite 2682 tests (2665 Vitest + 17 Node) PASS; typecheck/lint/secret scan/production build PASS. Frozen install, hosted PR/main CI and Vercel preview PASS; PR #54 merged through guarded normal workflow, no force push. Desktop/tablet 768/1024/1440px and mobile 375/390/430px have no horizontal overflow. Invalidated local test receipt suspended the exact original bookmaker/price, blocked comparison, and recovered only after explicit fresh-quote confirmation. Only the local test leg was removed afterward. No migration or production credential/configuration change was needed.

### Production acceptance and automatic recovery

- Mexico: Aldosivi–Sarmiento has no eligible fresh local native offer; all three market tabs expose no add controls and the former unpriced path is absent. Other fixtures stay selectable: Málaga–Espanyol and recovered Boyacá Chicó–Cúcuta have genuine Betsson outcomes. No foreign informational reference becomes executable.
- Colombia: suspended Betsson does not hide genuine bwin Aldosivi odds. A controlled HOME leg was accepted at exact bwin 2.50 with its signed canonical quote binding. Switching QA GEO to Peru suspended this exact leg and proposed, but did not automatically accept, 1xBet. Dependent complete comparison/affiliate actions remained blocked.
- Peru: explicit fresh confirmation accepted the proposed exact 1xBet price 2.573 (display 2.57). Inkabet remained suspended. Match Center TOTAL_GOALS 2.5 (2.52/1.52) and BTTS (2.02/1.71) were real 1xBet quotes, not synthetic replacements. Only this task's temporary leg was removed; the original Atlético de Madrid–Osasuna leg and stake were preserved.
- Real production mapping recovery: Al Fateh–Al Ahli now offers Betsson HOME 5.20 in MX/CO and Inkabet 5.20 / 1xBet 6.19 in PE. Boyacá Chicó–Cúcuta offers Betsson 2.22 in MX/CO and Inkabet 2.22 / 1xBet 2.19 in PE. Original observations remain October 8 13:50 and 21:05 UTC; replay did not manufacture freshness. Envigado–Internacional Palmira remains POSTPONED and non-selectable in all three GEOs.
- Four automatic cycles after READY (10:10, 10:15, 10:20, 10:25 UTC) performed respectively 3/3/2/0 saved-snapshot repair actions; these are snapshot counts, not fixture counts. All used zero provider requests. Final control SUCCEEDED / data CRITICAL / overall PARTIAL is reported honestly. No active worker lease remained; next budget-eligible provider refresh was 11:05:17.694 UTC, not manually forced.
- Direct production API checks: zero/null prices HTTP400; cross-origin admission HTTP403; unbound or forged-receipt comparison returns suspended/null-priced legs and no complete comparison. Each response reports providerRequests=0. Ordinary public navigation remains DB/cache-only.
- HTTPS/apex and MX/CO/PE/BR/EN public routes plus both sitemaps HTTP200; www HTTP308 to apex. Existing Match Center scores, lineups, H2H and standings rendered unchanged. Light/dark rendering and light-mode reload persistence verified; page overflow 0 at 375/390/430/768/1024/1440, odds controls 44px.
- Production/client secret scan: 16 documents/client assets, zero leaks or prohibited tracked env files. No LivaSports app console errors observed. Existing third-party 1xaff iframe checker attempts to read cookies are blocked by its sandbox; this warning is not masked and the sandbox was not weakened.

### Timestamped post-release coverage — 10:25–10:27 UTC

These are all 277 upcoming seven-day fixtures in the current 32-competition acquisition registry, measured separately per GEO. The latest valid main enables 41 sports competitions, not the old historical 34/BR launch registry.

| GEO | Before native fixtures | After native fixtures | Complete 1X2 | Complete OU2.5 | Complete BTTS | No current native odds |
|---|---:|---:|---:|---:|---:|---:|
| MX |134|136|135|136|136|141|
| CO |179|181|181|180|181|96|
| PE |185|187|187|180|179|90|

DB integrity: 41 enabled competitions, 43,695 fixtures, 2,453 teams, 47,861 provider mappings, 11,448 legacy current-odds rows. Duplicate fixture public IDs, competition slugs, external provider mappings and canonical GEO quote identities: 0. Orphan GEO odds and active worker leases: 0. Latest migration remains `068_pe_1xbet_affiliate_host.sql`. Nine provider mappings were added by normal saved-data recovery; no fixture ID, kickoff or score was rewritten.

Idempotency: pre-release narrow saved-response rehearsal wrote 77 current/history rows on its first pass and zero on the repeat; the complete transaction was rolled back. An additional post-release rehearsal lost its database connection and is NOT counted as another PASS; no transaction was committed. A read-only 10:32:29 UTC audit confirmed unchanged competition/fixture/team/mapping/current-odds counts, no duplicates and zero active worker leases. Actual automatic recovery reached zero replayed repairs by 10:25. Failure/expiry/reprice/late-response branches were exercised in tests and local browser QA; no provider outage or production clock mutation was injected. Production observation is a bounded check, not proof of permanent uptime.

Request accounting: this task's provider calls 0; observed automatic post-release cycles 0. Monthly cap 5000, accounted usage 325 (317 local + 8 reconciled external), routine remaining 4325; UTC-day 6, rolling24h 59, daily paced cap 179, normal stop143, controlled stop161, routine headroom84, utilization33%, projected EOD14. Historical unmetered calls13 remain visible. Existing normal forecast77/day and quota/cadence model unchanged; no paid service or entitlement change.

Remaining availability limitations: MX Peru Liga1 retains a CRITICAL expired-quote observation alongside the latest Betsson VALID_EMPTY result; it is not hidden by the paced deadline correction. MX LaLiga2 has UNKNOWN near-term availability despite a successful wider-window refresh. Copa Colombia returns verified feed404s in all three GEOs with bounded scheduled rechecks; source suspensions, absent fixtures and ambiguous Conference League participants remain quarantined. Current health: HEALTHY34, DEGRADED30, CRITICAL1, UNKNOWN1, UPSTREAM_UNAVAILABLE3, IDLE27. A valid signed selection is usable only until its original expiry/kickoff and while its exact quote remains fresh/active, same GEO/book/market/outcome/identity/price; otherwise it suspends and blocks price-dependent actions pending explicit acceptance of a currently valid alternative. Missing local prices are never invented.

### Archived October 1 incident and release evidence

Baseline: `647ae06a7fc5c4102a09dee7dca9ad6a33021b7b`, 2026-10-01 08:37:07 UTC. Implementation released through PR #35 as `1b15ce68503d1b3e05e5834213f2c33f8bd8a401`; production READY at 09:23:59 UTC. Systemic guardrails are operational. Native coverage remains DEGRADED for the explicitly documented provider/mapping gaps; this is not a claim of permanent recovery.

## A–B. Why cron success concealed degraded data

The old scheduler advanced target success for an HTTP-success snapshot even when a requested tournament had no mapped prices. Batch-level success credited empty members. Last-success ages also generated false overdue alerts for competitions whose next fixtures were outside the supported seven-day odds window. Hidden insurance could fill commercial coverage without proving public native health. Catalog matching omitted the exact Paulista A1 alias; permanent empty-catalog suppression, redundant historical backoff gating, and priority-only ordering could leave targets excluded or delayed. Retry-state write failures were swallowed. These paths are now separately measured and guarded.

## C. Sportingbet 0/103

Two tightly bounded raw-feed checks covered Sportingbet and 1xBet for tournament IDs 325,155,54,242. Sportingbet returned 31 fixtures with bookmaker data: all 31 had bookmakerIsActive=false and suspended=true, although 127 canonical market/price rows carried active flags. The existing strict Sportingbet status policy correctly rejects those as usable native odds. No alias substitution or parser loosening is justified. Baseline missing 1X2: 27 fixtures explicit suspended/removed status, 18 no quote in latest identified response, 58 latest target HTTP404 (40 FA Cup,18 Brazil Serie B). This proves current absence/status, not that Sportingbet never supports these competitions.

## D–E. Betsson and 1xBet

Betsson 43/103 native 1X2: 20 missing fixtures have no quote in their latest identified response; 40 FA Cup fixtures have target HTTP404, not quota exhaustion. 1xBet18/103: 52 explicit provider-status exclusions,9 no quote,24 unresolved identity cases (9 Copa del Rey,15 FA Cup). The live 1xBet response contained71 bookmaker fixtures:21 active,50 inactive,1 suspended;497 canonical market/price rows had active flags. Identity-quarantined events are NOT proven provider absence and are NOT silently mapped with relaxed time/team tolerances. No returned eligible quote lost after persistence was found in the baseline.

## F. Catalog141 unmatched

135 Brazilian rows remained unmatched because the missing exact Paulista A1 alias kept a canonical Brazil competition unresolved. Deterministic reconciliation maps that competition and classifies unrelated rows outside the approved registry. Production and rolled-back rehearsal:1920 catalog rows,33mapped,1881ignored with reason,6unmatched,0ambiguous. Six Saudi rows are Crown Prince Cup1634,Division12298,Kings Cup2110,Second Division48511,Super Cup2296,U21Elite48513; none is safely Saudi Pro League Play-offs. No active playoff fixture was present. Repeat reconciliation did not inflate source occurrence counts. The 141-to-6 reduction includes justified out-of-scope classification, not 135 newly enabled leagues.

## G. REFRESH_NOT_EXECUTED

Baseline14 open incidents:13 refer to competitions outside the seven-day refresh window; Copa del Rey has a genuine mapping/no-native result incorrectly treated as success. Historical FA Cup empty success and newer404 evidence are retained, not relabeled quota exhaustion. Actual overdue/expired targets retain alerts; explicit mapping failure remains degraded rather than becoming healthy.

## H–K. Durable behavior

See `docs/ODDS_DATA_PLANE_RECOVERY.md`:136 target rows, separate control/data health, source attribution and responsible party, verified per-target outcomes, transactional post-write assertions, frozen quote TTL, due+one-tick SLA, atomic target leases, bounded backoff, mapping quarantine, oldest-pending fairness across and within bookmakers. Existing deduplicated incidents/verified recovery observations remain automatic; acknowledgements do not gate recovery.

## L. Request impact

Baseline rolling24h115; last3d365 (~122/day); current UTC day38;2 controlled diagnostic requests added (accounted, no retries). No Sportmonks calls. Baseline forecast204/day,peak206, within an unusually high end-of-subscription paced cap1665/day. The cap is dynamic, not a new operating target. Full current forecast at09:16:21:209/day,peak210,cap1705/day,87.7% reserve. Under a representative full-period150/day paced ceiling, including later fixtures entering seven days:73/day average,110 peak,51.3% average reserve (26.7% peak),scale5.95. As time advances forecasts change; the09:35 worker forecast was218/day atcap1726. Hourly hard cap72; automatic daily hard stop80% of paced allowance (1364 atcap1705), controlled90%; monthly5000/4650routine/4750internal unchanged. No cap/cadence increase or subscription change. Normal navigation consumed zero provider requests.

## M. Before/after

Full136competition/bookmaker matrix and309fixture/public-book rows are in the baseline JSON companion. The sanitized production companion is `output/p0-odds-production-acceptance.json`. Consistent production snapshot at09:45:39 UTC:

| Measure | Before08:37 | After09:45 |
|---|---:|---:|
| Upcoming fixtures7d |103|103|
| Betsson native fixtures |43|43|
| Sportingbet BR native fixtures |0|0|
| 1xBet native fixtures |18|40|
| Hidden Betano native fixtures |62|62|
| Unmatched catalog identities |141|6|
| Open incidents |15|8|
| REFRESH_NOT_EXECUTED incidents |14|1|
| Oldest currently usable quote,minutes |292|330|
| Expired stored quote rows,excluded publicly |70|70|

Oldest-quote age increased with elapsed time; it is not a recovery claim or proof of expiry violation. Quote expiry is frozen at observation. The public consistency audit found zero expired active prices. Six elapsed stale-after targets remain explicit provider404/backoff cases, not hidden scheduler success; a newly attempted hiddenBetanoMLS404 adds another target-not-found state. The new matrix has108outside-window,7TARGET_NOT_FOUND,2MAPPING_DEGRADED,15HEALTHY,3PARTIAL_PROVIDER_COVERAGE,1PROVIDER_EMPTY target states. There are zero REFRESH_OVERDUE states in that snapshot. The baseline did not have comparable durable queue states:14legacy refresh incidents must not be equated to14actually due targets. Thirteen outside-window false incidents resolved automatically; the remaining historical Copa del Rey refresh incident stays visible during the existing recovery observation grace period. Freshness diagnostics count72stale rows versus70before;70are expired. This report does not hide that aging metric. Proxy selection share had fallen75%to71.6%by09:40; broad public coverage remains degraded.

## N–O. Acceptance and limitations

Migration ran twice and real saved Betsson Brazil Serie B/MLS payload replayed twice in a rolled-back transaction:second history/current writes0;provider calls0. A new strict source-table assertion initially misclassified beyond-seven-day prices as lost writes; it was corrected to match the existing horizon and regression-tested. Actual owner component and production owner/public pages rendered at1440/390px:136target rows,scrollable tables,no page overflow. Required10competitions are included in the matrix; all but Brazil Serie A currently lack next-seven-day fixtures, so native acceptance for them is NO SAMPLE, not fabricated PASS.

Automatic production cycles09:25,09:30,09:35 completed with controlSUCCEEDED/dataDEGRADED/overallPARTIAL. The09:35 tick crossed the MLS1xBet due boundary, used exactly1provider request, verified2upcoming mapped fixtures/14native selections, committed119current writes across the payload and released all leases. Native fixture coverage increased18to19. Queue has123WAITING,3PENDING,6BACKOFF; no active lease remained. No manual refresh or uncontrolled backfill was used.

The09:40 cycle used2requests: a1xBet batch(390BrazilSerieB,329CopaRey) and SportingbetMLS242. BrazilSerieB verified10mapped fixtures/49native selections; CopaRey returned9unmatched events and correctly becameMAPPING_EMPTY/BLOCKED without success credit. SportingbetMLS becameVALID_EMPTY with0native selections. Control correctly becamePARTIAL; data remainedDEGRADED. Current coverage rose to25/1031xBet. Afterward124WAITING,1PENDING,1BLOCKED,6BACKOFF and0active leases. Acceptance thus observed4automatic cycles including2actual refresh cycles/3requests, plus the2earlier accounted diagnostic requests. Budget now2812used,1838routine remaining,43UTCtoday,117rolling24h,automatic stop1384atdynamic allowance1730. No usage spike or quota bypass.

The09:45 cycle processed the remaining pendingFA Cup1xBet target19:40returned fixtures,25mapped,15quarantined,154verified native selections,175current writes. Coverage reached40/103(+22fixtures frombaseline). A second request for hiddenBetanoMLS returned404 and entered bounded backoff; fresh saved odds were not mass-closed. Final queue124WAITING,1BLOCKED,7BACKOFF,0PENDING,0active leases. Five automatic cycles/5scheduled requests observed over22minutes afterREADY, plus2controlled diagnostics (7accounted requests total in this validation window). No retry storm; the failed target was not retried immediately. Final budget details are in the JSON companion. This is evidence of bounded production failure handling, not an injected5xxrecovery test.

Read-only production smoke: HTTPS/apex/www redirect,BR/MX/EN routes,twoBRmatch pages,sitemap.xml andsports-sitemaps.xml PASS;34competition links preserved. Public API/DB consistency:10REALprices matched verifiedODDSPAPI source rows,32PROXYprices explicitly attributed,0expired active prices,0publicBetano rows,providerRequests0. Existing finished slip selection was inspected without modification. Runtime log inspection found0warnings/errors/fatal entries. Remote15document/client secret scan found0leaks. No live outage was injected; network/backoff/stale-lease recovery was verified in tests and transactional rehearsal, not misreported as an observed production outage.

Remaining gaps: Sportingbet source flags are inactive/suspended; FA Cup/BrazilSerieB/CopaRey404targets retain bounded retry;24baseline1xBet identities remain quarantined pending deterministic evidence. No ambiguous mapping, fake quote or public-feed masking was introduced. A short production observation across multiple cycles is not several hours of soak testing and cannot prove permanent reliability.

## P. Release gates

Frozen install PASS. Final full suite1883PASS (1866 Vitest +17 Node); lint, typecheck, production build and secret scan PASS. Hosted PR and main CI PASS; Vercel preview PASS. Migration055 applied09:16:16.678UTC through the existing runner; immediate second run applied nothing. PR #35 merged; implementationSHA`1b15ce68503d1b3e05e5834213f2c33f8bd8a401`, deployment`dpl_GKW9K1ekUCaX28HW4fTbSwGjqFKo` READY/Current onhttps://livasports.com. Runtime releaseSHA matched. No production secrets or local helpers committed. No standings,SEO,GSC,social,affiliate,GEO,MySlip or public-design changes. Original unrelated dirty workspace preserved; release checkout synchronized withmain before this report-only follow-up.
