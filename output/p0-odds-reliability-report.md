# P0 odds reliability — incident and release evidence

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
