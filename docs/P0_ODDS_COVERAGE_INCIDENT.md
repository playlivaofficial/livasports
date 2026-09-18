# P0 — Pregame odds coverage incident (2026-09-18)

## Symptom

Upcoming fixtures of major competitions were shown without odds although OddsPapi supplies pregame prices. Public read-model probe on production before the fix (competition hubs, first page of upcoming fixtures, `main` `22e9c37`):

| competition | upcoming rows | in 7d | with REAL price | unavailable | Betano | Betsson |
|---|---:|---:|---:|---:|---:|---:|
| europa-league | 30 | 0 (next 2026-10-15) | 0 | 30 | 0 | 0 |
| conference-league | 30 | 0 (next 2026-10-15) | 0 | 30 | 0 | 0 |
| fa-cup | 27 | 27 (today) | 0 | 27 | 0 | 0 |
| la-liga-2 | 30 | 11 | 0 | 30 | 0 | 0 |
| copa-del-rey | 20 | 0 | 0 | 20 | 0 | 0 |
| championship | 30 | 12 | 2 | 28 | 1 | 1 |
| ligue-2 / super-lig / liga-mx | 30 | 9 | 6–9 | 21–24 | 2–6 | 5–9 |
| premier-league / serie-a / bundesliga / ligue-1 / la-liga | 30 | 9–10 | 18–20 | 9–12 | 15–20 | 9–10 |

It is systemic, not UEFA-specific.

## Root causes (code)

1. **Hardcoded scheduler target set.** `schedulerTournaments()` scheduled only the four pinned tournaments plus the static `M5_EXPANDED_TOURNAMENTS` allowlist (18 IDs). Any competition without an allowlisted ID was never requested — the Conference League (`uefa-europa-conference-league` has an identity rule but never had an ID), La Liga 2, Carabao Cup's peers, etc. Previously "rejected" IDs (FA Cup, Copa del Rey, Copa do Brasil, Saudi Pro League) were excluded forever, even once the provider listed fixtures. A competition therefore needed a manual `canary-tournament` run to become useful.
2. **Throughput starvation.** Every non-pinned tournament was requested as a singleton and the planner allowed **one** expanded tournament per bookmaker per 5-minute tick, so 18+ feeds shared one slot; near-term feeds waited behind the queue and behind budget-scaled cadence (scale up to 128×), while the ledger reported `BUDGET_STOPPED` ticks with 0–2 requests.
3. **No health contract for the commercial windows.** Health measured full-calendar bookmaker pairs; a dead tournament with fixtures tonight was invisible.

The downstream pipeline (fixture matching with 10-minute tolerance, snapshot-scoped closes, freshness TTL, Betsson noisy-flag normalizer, REAL-first with disclosed PROXY) was verified correct and is unchanged.

## Fix (`claude/p0-odds-coverage-incident`)

* `src/providers/oddspapi/tournament-catalog.ts` — registry-driven targets: every provider catalog row that resolves through `TOURNAMENT_IDENTITY_RULES` to an **enabled** registry competition is scheduled. IDs are always copied from the provider catalog; nothing is invented. Rejected IDs are eligible again but probed in isolation.
* `src/odds/scheduler.ts` — bounded automatic catalog expansion: when an enabled competition has upcoming fixtures (≤14d) and no catalog row, one `/v4/tournaments` call per 24h (only with verified budget ≥ discovery floor) merges provider rows. Empty singleton feeds (provider 404 "fixture not found") back off **12 hours** instead of the 15-minute ladder. Targets carry `lastAttemptAt`/`consecutiveFailures`.
* `src/odds/scheduler-policy.ts` — **proven** feeds (prior success, no current failure) share requests in fours like the pinned batch; unproven feeds stay isolated, at most 2 probes per bookmaker per tick; **recovery guard**: a feed with fixtures inside 72h and no usable coverage is re-probed at least every 6h regardless of budget pacing and leads the queue; the forecast models the same throughput so the budget scaler is honest.
* `src/odds/coverage-health.ts` — permanent contract: per competition, next 24h/3d/7d/14d — fixtures, any-odds, MATCH_WINNER, TOTAL_GOALS 2.5, BTTS, Betano real, Betsson real, both, proxy-only, neither, stale-only (% and counts), last refresh age; flags `NO_SCHEDULER_TARGET`, `ZERO_COVERAGE_TODAY`, `ZERO_COVERAGE_NEAR_TERM`, `REFRESH_OVERDUE`, `BETANO_REAL_COLLAPSE`, `BETSSON_REAL_COLLAPSE`, `BOTH_BOOKMAKERS_COLLAPSE`, `PROXY_DOMINANT`, `STALE_QUOTES`, `TARGET_FAILING`; state healthy/warning/critical/idle, unhealthy first. Exposed as `coverage` on `GET /api/internal/odds-health` (CRON_SECRET) and `odds cli coverage-health`.
* Regression: `src/odds/coverage-incident.test.ts` (cases A–J + throughput), updated `tournament-catalog.test.ts`, `scheduler.test.ts`, `scheduler-policy.test.ts` (documented requirement changes: allowlist gate removed; proven feeds batched; unproven probes bounded).

## Request budget

Plan verified by `verifiedAccountPeriod`: 5,000 requests per subscription period; routine ceiling 4,000; daily routine cap `min(240, remaining/remaining-days)`; planner allowance `min(216, 0.9×remaining/days)`. Estimated after the fix (26 active tournaments × 2 bookmakers): quiet day ≈ 60–100 requests, matchday ≈ 150–220 (stable batch 1 + proven chunks ≤5 + ≤2 probes per bookmaker per tick, cadence 15–720 min by kickoff distance, scaled to the allowance). Before the fix the same coverage needed ~4× more requests because every expanded feed was a singleton.

## Refresh / backfill

No manual DB writes. The existing cron-job.org ticker (`GET /api/internal/odds-refresh`, every 5 min) applies the new plan automatically after deploy: catalog expansion (if needed), then priority refresh of near-term zero-coverage feeds, then proven batches. Verification is done through the public read model (`scripts/`-free probe in `output/p0-odds-public-*.json`) and, with credentials, `odds-health.coverage`.

## Operational note

Verification of `odds_refresh_targets`, budget ledger and provider-side prices requires either the production database (Vercel-authenticated read) or `CRON_SECRET` for `/api/internal/odds-health`. Neither was available to the agent in this session (the Vercel CLI token had become invalid); those checks are recorded as NOT RUN where applicable.
