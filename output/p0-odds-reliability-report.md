# P0 odds reliability — incident and release evidence

Baseline: `647ae06a7fc5c4102a09dee7dca9ad6a33021b7b`, 2026-10-01 08:37:07 UTC. Release acceptance is pending; this report does not claim production recovery yet.

## A–B. Why cron success concealed degraded data

The old scheduler advanced target success for an HTTP-success snapshot even when a requested tournament had no mapped prices. Batch-level success credited empty members. Last-success ages also generated false overdue alerts for competitions whose next fixtures were outside the supported seven-day odds window. Hidden insurance could fill commercial coverage without proving public native health. Catalog matching omitted the exact Paulista A1 alias; permanent empty-catalog suppression, redundant historical backoff gating, and priority-only ordering could leave targets excluded or delayed. Retry-state write failures were swallowed. These paths are now separately measured and guarded.

## C. Sportingbet 0/103

Two tightly bounded raw-feed checks covered Sportingbet and 1xBet for tournament IDs 325,155,54,242. Sportingbet returned 31 fixtures with bookmaker data: all 31 had bookmakerIsActive=false and suspended=true, although 127 canonical market/price rows carried active flags. The existing strict Sportingbet status policy correctly rejects those as usable native odds. No alias substitution or parser loosening is justified. Baseline missing 1X2: 27 fixtures explicit suspended/removed status, 18 no quote in latest identified response, 58 latest target HTTP404 (40 FA Cup,18 Brazil Serie B). This proves current absence/status, not that Sportingbet never supports these competitions.

## D–E. Betsson and 1xBet

Betsson 43/103 native 1X2: 20 missing fixtures have no quote in their latest identified response; 40 FA Cup fixtures have target HTTP404, not quota exhaustion. 1xBet18/103: 52 explicit provider-status exclusions,9 no quote,24 unresolved identity cases (9 Copa del Rey,15 FA Cup). The live 1xBet response contained71 bookmaker fixtures:21 active,50 inactive,1 suspended;497 canonical market/price rows had active flags. Identity-quarantined events are NOT proven provider absence and are NOT silently mapped with relaxed time/team tolerances. No returned eligible quote lost after persistence was found in the baseline.

## F. Catalog141 unmatched

135 Brazilian rows remained unmatched because the missing exact Paulista A1 alias kept a canonical Brazil competition unresolved. Deterministic reconciliation maps that competition and classifies unrelated rows outside the approved registry. Rolled-back DB rehearsal:1920 catalog rows,33mapped,1881ignored with reason,6unmatched,0ambiguous. Six Saudi rows are Crown Prince Cup1634,Division12298,Kings Cup2110,Second Division48511,Super Cup2296,U21Elite48513; none is safely Saudi Pro League Play-offs. No active playoff fixture was present. Repeat reconciliation did not inflate source occurrence counts.

## G. REFRESH_NOT_EXECUTED

Baseline14 open incidents:13 refer to competitions outside the seven-day refresh window; Copa del Rey has a genuine mapping/no-native result incorrectly treated as success. Historical FA Cup empty success and newer404 evidence are retained, not relabeled quota exhaustion. Actual overdue/expired targets retain alerts; explicit mapping failure remains degraded rather than becoming healthy.

## H–K. Durable behavior

See `docs/ODDS_DATA_PLANE_RECOVERY.md`:136 target rows, separate control/data health, source attribution and responsible party, verified per-target outcomes, transactional post-write assertions, frozen quote TTL, due+one-tick SLA, atomic target leases, bounded backoff, mapping quarantine, oldest-pending fairness across and within bookmakers. Existing deduplicated incidents/verified recovery observations remain automatic; acknowledgements do not gate recovery.

## L. Request impact

Baseline rolling24h115; last3d365 (~122/day); current UTC day38;2 controlled diagnostic requests added (accounted, no retries). No Sportmonks calls. Baseline forecast204/day,peak206, within an unusually high end-of-subscription paced cap1665/day. The cap is dynamic, not a new operating target. Fixed103-fixture reconstruction is also204/day. Under a representative full-period150/day paced ceiling, that cohort scales to71/day average,112 peak,52.7% reserve,scale3.81. Later fixtures entering seven days are excluded from this reconstruction; release acceptance must record the full current forecast. Hourly hard cap72; automatic daily hard stop80% of paced allowance, controlled90%; monthly5000/4650routine/4750internal unchanged.

## M. Before/after

Before:103 fixtures,Betsson43,Sportingbet0,1xBet18,hiddenBetano62;proxy75%;current quote oldest292min;70expired stored rows;141unmatched;15open incidents (14refresh,1proxy dominant). Full136competition/bookmaker matrix and309fixture/public-book rows are in the JSON companion. After: pending production acceptance. Catalog33/6 result is a rolled-back rehearsal, not yet production state.

## N–O. Acceptance and limitations

Migration ran twice and real saved Betsson Brazil Serie B/MLS payload replayed twice in a rolled-back transaction:second history/current writes0;provider calls0. A new strict source-table assertion initially misclassified beyond-seven-day prices as lost writes; it was corrected to match the existing horizon and regression-tested. Actual owner component rendered with saved production evidence at1440/390px:136rows,scrollable tables,no page overflow. This is local component QA, not production data recovery. Required10competitions are included in the matrix; all but Brazil Serie A currently lack next-seven-day fixtures, so native acceptance for them is NO SAMPLE, not fabricated PASS. Production cycles, due-boundary rollover, final counts/API/UI consistency and deployment remain pending.

## P. Release gates

Frozen install PASS. Final full suite1883PASS (1866 Vitest +17 Node); lint, typecheck, production build and secret scan PASS. Migration055 additive/idempotent, not applied. PR/CI/deployment pending. No production secrets or local helpers are intended for commit. No standings,SEO,GSC,social,affiliate,GEO,MySlip or public-design changes.
