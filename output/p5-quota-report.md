# P5 OddsPapi quota-hardening audit
Snapshot: 2026-09-21T08:28:17.959Z. Release remains HELD; no P5 deployment, commit, push, or backfill was performed for this check.

## Result
Quota forecast gate PASS against the current real database: 34 enabled competitions; four feeds; 32 catalog-mapped competitions (Paulista A1 and Saudi play-offs remain unmapped). Six competitions have scheduled fixtures in the active seven-day sample, giving 24 active bookmaker/competition targets. All 34 were evaluated, not replaced by synthetic fixtures.

Original observation: 266/day against 273/day (97.4%). Replaying the former policy against this audit snapshot: 272/day, 1900/7d. New: 124/day rounded up, 863/7d, busiest day 196. Average reserve 54.6%; busiest-day reserve 28.2%. Per-day forecast: 107, 52, 70, 90, 162, 186, 196. Counts change with clock, kickoff transitions and concurrent production scheduler progress.

## Why the old forecast was excessive
- Forecast ceiling was 100% of paced allowance; the urgency reserve was only a batching preference, not a normal-operation forecast reserve.
- 92 bookmaker/competition targets included distant fixtures from the 45-day canonical read window. Distant competitions continued polling every 12 hours before scale.
- A due historical stable tournament pulled not-due stable companions into its request.
- Empty coverage imposed a six-hour refresh floor even when quota scaling asked for slower polling.
- Automatic transport permitted one immediate retry; rolling daily accounting excluded manual billable requests.
- Single worker lease already prevented concurrent ingestion. Public routes, My Slip, analytics and owner rendering already reuse persisted data without provider fetches; these boundaries remain.

## Exact cadence
Five-minute scheduler tick; only SCHEDULED fixtures strictly before kickoff and within seven days. LIVE/finished/expired fixtures are not requested: this is a pregame-only plan.

| Time to kickoff | Base interval, four feeds | This snapshot: scale 1.56 |
|---|---:|---:|
| >7 days | No refresh until in window | — |
| >3–7 days | 720 min | 1,125 min |
| >1–3 days | 360 min | 565 min |
| >2–24 hours | 120 min | 190 min |
| >0–2 hours, including final pregame | 30 min | 50 min |

Intervals round up to five-minute ticks. The scaler checks both seven-day average and busiest forecast day against 75% of the verified daily allowance (204/day now). At 70% actual rolling utilization it applies an additional 1.5× slowdown; at 85% 4×. Automatic requests stop at 80% (218), including urgent batches. Controlled diagnostics/recovery stop at 90% (245). All billable requests, failures and uncertain outcomes count, regardless of consumer or purpose. Monthly routine ceiling 4,650; controlled ceiling 4,750; final 250 of provider's 5,000 remain protected.

Urgent and missing-coverage targets lead when due. They do not bypass quota, backoff or expiry. There is no paid live-odds request or claim of live entitlement.

## Source cost
Provider accepts ONE bookmaker per request, up to four tournament IDs. Table values are daily averages of exact seven-day scheduled request counts. Retries/diagnostics are not disguised as normal forecast traffic; their room is reserved.

| Source | Old requests/day | New requests/day |
|---|---:|---:|
| sportingbet.bet.br | 67.6 | 31.3 |
| betboo.bet.br | 67.6 | 31.3 |
| betano.bet.br | 69.6 | 30.4 |
| betsson | 66.7 | 30.3 |

## Competition attribution
A shared request is fractionally attributed equally to its member competitions; fractions are accounting allocations, not fractional HTTP requests. Zero means no scheduled fetch in this seven-day forecast, not unsupported product navigation. Distant/not-scheduled competitions stay in navigation.

| Canonical competition | Provider IDs | Old 7d attributed requests | New 7d attributed requests |
|---|---|---:|---:|
| argentina-primera-division | 155 | 112.50 | 61.50 |
| brasileirao-serie-a | 325 | 104.00 | 0.00 |
| brasileirao-serie-b | 390 | 316.67 | 202.50 |
| bundesliga | 35 | 26.92 | 0.00 |
| carabao-cup | 21 | 0.00 | 0.00 |
| carioca-serie-a | 92 | 0.00 | 0.00 |
| champions-league | 7 | 40.50 | 0.00 |
| championship | 18 | 31.67 | 0.00 |
| concacaf-champions-cup | 498 | 0.00 | 0.00 |
| conference-league | 34480 | 40.50 | 0.00 |
| copa-del-rey | 329 | 152.92 | 81.00 |
| copa-do-brasil | 373 | 29.50 | 0.00 |
| copa-do-nordeste | 1596 | 0.00 | 0.00 |
| copa-libertadores | 384 | 0.00 | 0.00 |
| copa-sudamericana | 480 | 0.00 | 0.00 |
| coppa-italia | 328 | 0.00 | 0.00 |
| eredivisie | 37 | 26.50 | 0.00 |
| europa-league | 679 | 28.33 | 0.00 |
| fa-cup | 19 | 0.00 | 0.00 |
| la-liga | 8 | 34.17 | 0.00 |
| la-liga-2 | 54 | 276.33 | 195.00 |
| liga-mx | 27464 | 104.00 | 170.00 |
| liga-portugal | 238 | 29.00 | 0.00 |
| ligue-1 | 34 | 23.50 | 0.00 |
| ligue-2 | 182 | 29.33 | 0.00 |
| mls | 242 | 287.33 | 153.00 |
| paulista-a1 | not mapped | 0.00 | 0.00 |
| premier-league | 17 | 104.00 | 0.00 |
| saudi-pro-league | 955 | 37.50 | 0.00 |
| saudi-pro-league-playoffs | not mapped | 0.00 | 0.00 |
| serie-a-italy | 23 | 22.33 | 0.00 |
| serie-b-italy | 53 | 21.75 | 0.00 |
| super-lig | 52 | 20.75 | 0.00 |
| uefa-super-cup | 465 | 0.00 | 0.00 |

## Retry, deduplication and preservation
- Automatic scheduler: no immediate transport retry. First upstream 500/429/auth failure stops the tick instead of fanning out across bookmakers.
- Durable account-wide transient circuit: 15 → 30 → 60 → 120 → 240 → 360 minutes, counted since last successful billable request within a six-hour window. Network failures are included. Auth 401/403 cooldown: six hours. Unmetered account reconciliation remains bounded to once/hour.
- Other target failures retain persisted exponential target backoff. Same bookmaker/overlapping tournament 4xx below 429 gets a six-hour ledger cooldown; no blind 4xx retry.
- Same bookmaker/overlapping tournament successful fetch has a five-minute cross-consumer deduplication guard. Duplicate planner identities are collapsed. Only due stable companions are requested. One successful fetch persists for all consumers.
- All request reservations are transaction-locked; worker lease prevents concurrent writers.
- 500, network failure, circuit stop or quota exhaustion does NOT persist an empty snapshot or close current quotes.
- Persisted REAL remains usable until its original fixed expiry or kickoff, whichever comes first. No outage extends it. Then resolve fresh hidden Betano REAL with source attribution/PROXY labeling, then lowest fresh visible alternate; otherwise unavailable.
- Prices can legitimately disappear after expiry, kickoff/status transition, explicit suspension/removal in a successful authoritative snapshot, identity/timestamp validation failure, or no exact fresh insurance candidate. Bookmaker identities remain; missing prices are not fabricated.

## Telemetry and current usage
Conservative ledger usage 1610/5,000; routine remaining 3040; days remaining 11.11; paced allowance 273/day. Ledger includes pre-audit external floor. Last provider-account result read earlier in P5 was 1,596 at approximately 07:42 UTC; this quota check made ZERO new provider requests. The database's older provider-reported counter is not represented as a current account reading.

Rolling 24h all-purpose billable requests: 171 (62.6%). UTC today 35; linear end-of-day estimate 100; remaining full daily allowance 102; automatic headroom 47; controlled headroom 74.
Past rolling day: 164 successful odds requests, seven HTTP 404 attempts, one unmetered account call; all recorded as SCHEDULED. Historical ledger does not separately label retry attempts, so a retry count cannot be claimed. New automatic immediate-retry count is zero by construction.
Historical three-day-rate period-end projection: 3777. New normal forecast extrapolation: approximately 2980 used at period end if the current fixture load persists. This is not a guarantee about future fixture counts; the planner recalculates and the ledger hard-stops.

## Verification
- Full tests: 1,111 Vitest + 17 validation = 1,128 passed.
- Typecheck, lint, production build, secret scan: PASS.
- SQL circuit query plan on Neon: PASS, read-only.
- Tests cover 34 × four-source forecast pressure, peak-day ceiling, quota 80/90 boundaries, warning/protection transitions, duplicate/circuit rejection, HTTP500 stopping without persistence, and REAL → attributed insurance → expired/unavailable.
- Local mobile MX dark UI reloaded after changes: three visible identities, horizontal overflow zero. Earlier P5 48-case locale/theme/width matrix preserved. No production release QA is claimed for undeployed changes.
- Public navigation remains DB/cache-backed; no provider call was made by this audit or local route verification.

## Remaining P5 release work
Quota check passes, but this is NOT P5 closure. Release was subsequently authorized after final gates. See output/p5-report.md for current release status. Do not label new production source coverage or deployment PASS before bounded ingestion/idempotency and production acceptance execute.
