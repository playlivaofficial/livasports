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
4. **Budget stops recorded as feed failures** (found 2026-09-18 with production diagnostics). A ledger refusal (`ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED`) inside a batch was written to `odds_refresh_targets` as a failure, so proven feeds (Bundesliga, Serie B, Championship, Argentina…) accumulated `consecutive_failures`, lost "proven" status and recovery priority, and were pushed into the retry ladder for a condition that was not theirs.
5. **Catalog merge discarded unmatched provider rows.** `mergeCatalogTournaments` kept only rule-matched slugs, so a provider row whose slug differs from the registry rule (La Liga 2 / Conference League) was thrown away at every expansion and the mapping gap was invisible in the stored catalog.
6. **Burst-then-starve ticks at the rolling-day ceiling.** The planner paced only by a forecast; actual spend (probes, retries, desynchronised due-times) exceeded it (211 SCHEDULED requests in the 24h to 2026-09-18T08:45Z vs a 210 ceiling), after which the ledger refused every request: 17 of 22 ticks between 07:05Z and 08:45Z made 0 requests while the two that did run went to the far-future stable batch, and same-day fixtures (Bundesliga, Serie B, Süper Lig, Championship, FA Cup) sat with expired quotes (`ZERO_COVERAGE_TODAY`, stale-only).

The downstream pipeline (fixture matching with 10-minute tolerance, snapshot-scoped closes, freshness TTL, Betsson noisy-flag normalizer, REAL-first with disclosed PROXY) was verified correct and is unchanged.

## Fix (`claude/p0-odds-coverage-incident`)

* `src/providers/oddspapi/tournament-catalog.ts` — registry-driven targets: every provider catalog row that resolves through `TOURNAMENT_IDENTITY_RULES` to an **enabled** registry competition is scheduled. IDs are always copied from the provider catalog; nothing is invented. Rejected IDs are eligible again but probed in isolation.
* `src/odds/scheduler.ts` — bounded automatic catalog expansion: when an enabled competition has upcoming fixtures (≤14d) and no catalog row, one `/v4/tournaments` call per 24h (only with verified budget ≥ discovery floor) merges provider rows. Empty singleton feeds (provider 404 "fixture not found") back off **12 hours** instead of the 15-minute ladder. Targets carry `lastAttemptAt`/`consecutiveFailures`.
* `src/odds/scheduler-policy.ts` — **proven** feeds (prior success, no current failure) share requests in fours like the pinned batch; unproven feeds stay isolated, at most 2 probes per bookmaker per tick; **recovery guard**: a feed with fixtures inside 72h and no usable coverage is re-probed at least every 6h regardless of budget pacing and leads the queue; the forecast models the same throughput so the budget scaler is honest.
* `src/odds/scheduler.ts` (2026-09-18) — a ledger stop exits the batch loop **before** the target upsert (no failure/retry written); the 12h empty-feed backoff applies only when no target in the batch has ever succeeded (a previously priced feed keeps the 15m→6h ladder); `scheduledTournaments` and `unmatchedCatalogRows` are surfaced on odds-health.
* `src/providers/oddspapi/tournament-catalog.ts` (2026-09-18) — the stored catalog keeps every well-formed provider row; `resolveCatalogTournaments` adds a registry lookup-name fallback (unique row in the matching country / `international-clubs` category whose name is one of the registry's reviewed lookup names; the ID is copied from the provider row, never guessed); `unmatchedCatalogRows()` lists the rows in registry categories that nothing resolves.
* `src/odds/budget.ts` + `src/odds/scheduler-policy.ts` (2026-09-18) — **rolling-day pacing**: `budgetHealth` exposes `rollingDay` (SCHEDULED billable requests in the last 24h), `dailyCap` (the ledger's own `min(240, remaining/remaining-days)`) and `rollingHeadroom`; `planScheduler` never plans more batches than the live headroom, orders urgent batches (recovery, or kickoff ≤12h, nearest first) ahead of everything, and stops routine batches at a 20% reserve line so the last fifth of the daily ceiling is only spent on urgent batches. `pacing` is recorded on every `odds_sync_jobs.result`.
* `src/odds/coverage-health.ts` — permanent contract: per competition, next 24h/3d/7d/14d — fixtures, any-odds, MATCH_WINNER, TOTAL_GOALS 2.5, BTTS, Betano real, Betsson real, both, proxy-only, neither, stale-only (% and counts), last refresh age; flags `NO_SCHEDULER_TARGET`, `ZERO_COVERAGE_TODAY`, `ZERO_COVERAGE_NEAR_TERM`, `REFRESH_OVERDUE`, `BETANO_REAL_COLLAPSE`, `BETSSON_REAL_COLLAPSE`, `BOTH_BOOKMAKERS_COLLAPSE`, `PROXY_DOMINANT`, `STALE_QUOTES`, `TARGET_FAILING`; state healthy/warning/critical/idle, unhealthy first. Exposed as `coverage` on `GET /api/internal/odds-health` (CRON_SECRET) and `odds cli coverage-health`.
* Regression: `src/odds/coverage-incident.test.ts` (cases A–J + throughput), updated `tournament-catalog.test.ts`, `scheduler.test.ts`, `scheduler-policy.test.ts` (documented requirement changes: allowlist gate removed; proven feeds batched; unproven probes bounded).

## Request budget

Plan verified by `verifiedAccountPeriod`: 5,000 requests per subscription period; routine ceiling 4,000; daily routine cap `min(240, remaining/remaining-days)`; planner allowance `min(216, 0.9×remaining/days)`. Estimated after the fix (26 active tournaments × 2 bookmakers): quiet day ≈ 60–100 requests, matchday ≈ 150–220 (stable batch 1 + proven chunks ≤5 + ≤2 probes per bookmaker per tick, cadence 15–720 min by kickoff distance, scaled to the allowance). Before the fix the same coverage needed ~4× more requests because every expanded feed was a singleton.

## Refresh / backfill

No manual DB writes. The existing cron-job.org ticker (`GET /api/internal/odds-refresh`, every 5 min) applies the new plan automatically after deploy: catalog expansion (if needed), then priority refresh of near-term zero-coverage feeds, then proven batches. Verification is done through the public read model (`scripts/`-free probe in `output/p0-odds-public-*.json`) and, with credentials, `odds-health.coverage`.

## Operational note

Verification of `odds_refresh_targets`, budget ledger and provider-side prices requires either the production database (Vercel-authenticated read) or `CRON_SECRET` for `/api/internal/odds-health`. On 2026-09-17 neither was available (expired Vercel CLI token); on 2026-09-18 the CLI session was refreshed with `vercel whoami` (refresh token), the production database was read with `default_transaction_read_only=on`, and `/api/internal/odds-health` was read with the secret held in process memory only. Evidence files are kept out of the repository (`output/p0-*-private.json`).
