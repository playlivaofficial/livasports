# P3 — Odds reliability & owner control plane

Companion to [ODDS_RELIABILITY_SLO.md](./ODDS_RELIABILITY_SLO.md) (the contract and runbook). This file records the
audit of the pre-P3 system, what P3 added, and the release evidence.

## 1. Audit of the reliability system before P3 (2026-09-18)

| Capability | State before P3 | P3 outcome |
| --- | --- | --- |
| `odds_refresh_targets` (per bookmaker × tournament success/attempt/retry/failure) | ALREADY PRESENT | reused as feed evidence |
| Scheduler planner (tiers by kickoff, recovery guard, proven batching, urgent-first ordering, rolling-day pacing with 20% reserve) | ALREADY PRESENT (P0 incident fixes) | reused; urgent batches now audited |
| Budget ledger (period + rolling-day ceiling, `budgetHealth`) | ALREADY PRESENT | extended with `budgetGovernor` (reserves, projection, pressure) |
| Empty-feed backoff (12h only for never-priced feeds), ledger stop never demotes a feed | ALREADY PRESENT | unchanged |
| Provider tournament catalog + 24h automatic expansion + registry lookup-name resolution | ALREADY PRESENT | rows now persisted in `odds_catalog_rows` with first/last seen + explicit mapping state |
| Unmatched catalog handling | PARTIAL (`unmatchedCatalogRows` on health only) | MAPPED / UNMATCHED / AMBIGUOUS / DISABLED / IGNORED_WITH_REASON, on the dashboard, owner *Retry mapping* |
| `/api/internal/odds-health` (cron secret) with P0 `coverage` block | ALREADY PRESENT | `version: p3.1` + full `reliability` document |
| Freshness TTL per quote, snapshot-scoped closes | ALREADY PRESENT | surfaced as CURRENT/AGING/STALE/EXPIRED + p50/p95/oldest ages |
| Bookmaker coverage health (`readBookmakerCoverageHealth`) | ALREADY PRESENT (calendar-wide) | kept; horizon-based bookmaker collapse detection added |
| Cron execution (cron-job.org → `/api/internal/odds-refresh` every 5 min) | ALREADY PRESENT | stall detection (`SCHEDULER_STALLED`) |
| Job history (`odds_sync_jobs.result`) and request ledger | ALREADY PRESENT | `pacing`, `integrity`, `reliability` recorded per tick |
| Health states / issue classification / provider-vs-internal separation | MISSING | `classifyCompetition` / `classifyGlobal` |
| Baseline anomaly detection (sudden collapse, proxy dominance) | MISSING | `odds_health_rollups` (14 d) baseline comparison |
| Post-refresh integrity check | MISSING | `integrityCheck` after every persisted snapshot |
| Incident history, deduplicated alerts, owner e-mail | MISSING | `odds_incidents`, `evaluateReliability`, SMTP transport reuse (`OWNER_ALERT_EMAIL`) |
| Recovery audit log | MISSING | `odds_recovery_actions` |
| Owner dashboard | MISSING | `/owner/health`, `/owner/health/[competition]`, `/api/owner/health` (existing owner session domain) |
| Manual bounded actions | MISSING | re-check, retry mapping, acknowledge, confirmed targeted refresh |
| Owner auth (`__Host-livasports_owner`, access-key hash, login rate limit) | ALREADY PRESENT | reused unchanged |
| Parallel/competing health systems | none created | P0 `coverage` block kept for continuity; P3 reads the same inputs |
| REDUNDANT | `odds_scheduler_health.feeds_refreshed` duplicates job results | left as is (used by legacy fields) |

## 2. What ships in P3

* `db/migrations/025_p3_odds_reliability.sql` — `odds_health_rollups`, `odds_incidents` (unique open row per
  competition + classification), `odds_recovery_actions`, `odds_catalog_rows`. Additive, bounded, small.
* `src/odds/reliability/` — `model.ts` (states, classifications, tiers, freshness, thresholds), `classify.ts`,
  `read.ts` (one bounded query set, no provider calls), `incidents.ts` (rollups, incidents, alerts, retention),
  `alerts.ts`, `recovery.ts` (targeted refresh safety), `catalog.ts` (mapping states).
* Scheduler: recovery-action logging (urgent batches, budget stops, catalog expansion), post-refresh integrity,
  catalog-row persistence, reliability evaluation at the end of every tick (never blocks the refresh path).
* Owner control plane: dashboard + detail pages + API, all behind the existing owner session, `noindex`, robots
  disallowed, excluded from sitemaps, `providerRequests: 0` on render.
* CLI: `odds cli reliability-health`, `odds cli evaluate-reliability`.
* Tests: classification A–H, recovery, catalog, incidents/alerts, owner security, governor, scheduler integration.

## 3. Release evidence (2026-09-18, times UTC)

| Item | Value |
| --- | --- |
| Feature branch | `claude/p3-odds-reliability-control-plane` |
| Commits | `cfca016` (engine + control plane), `df4cecf` (owner UI fixes) |
| Production deployments | `dpl_74B8xMudw6v9Lcjb29ro1h5GzNDu` (11:46:36Z), `dpl_7W38U5SMeEzXDqRXN6uM8LoY9FCQ` (11:59:13Z), apex `livasports.com` |
| Migration 025 | applied from process memory with the runner's semantics: 893 ms, four empty tables, 0 invalid indexes, `schema_migrations` row 025 recorded once |
| Gates | vitest 1019/1019 (126 files), typecheck, lint, production build, secret scan 0 leaks, node tests 17/17 |
| Owner security (production, no session) | `/owner/health` and `/owner/health/<competition>` render only the login gate with `<meta name="robots" content="noindex, nofollow, nocache">`; `/api/owner/health` 401 with `X-Robots-Tag: noindex, nofollow`; cross-origin POST 403; `robots.txt` disallows `/owner/`; sitemap contains 0 owner URLs; no secret names in HTML/JSON |
| Owner dashboard QA | local `next start` against the production database with a throwaway local owner key (the production owner secrets are Vercel *sensitive* values and were never read): summary cards, incidents table, competition table with filters/sort, catalog rows, recovery log, competition detail (fixtures, quote freshness/ages, feeds, requests, decisions, incidents); Re-check health POST 200; mobile 375 px without horizontal scroll |
| providerRequests during dashboard rendering | 0 (page and API read the database only; ledger unchanged) |
| providerRequests during public navigation | 0 — ledger non-scheduled/jobless counts unchanged across 14 public pages, a match page and `/api/slip/compare` |
| My Slip regression | A: 3 legs, both bookmakers COMPLETE 3 REAL, totals equal the price products; B: 5 legs, Betano COMPLETE 5 REAL, Betsson ESTIMATED_COMPLETE 3 REAL + 2 disclosed PROXY; `providerRequests: 0` |
| Internal health | `GET /api/internal/odds-health` (cron secret held in memory) → `version p3.1`, `reliability` document present |
| First production evaluations | 11:50:07Z tick: rollups written for 34 competitions, incident opened `la-liga-2 / TARGET_MISSING / CRITICAL` (channel DASHBOARD — `OWNER_ALERT_EMAIL` not set), catalog rows persisted (29 MAPPED, 1 AMBIGUOUS: provider 27466 `liga-mx-clausura`, 0 future fixtures); 11:55:04Z tick: incident updated, no duplicate |
| Budget at release | used 1,059 / 4,000 routine; rolling day 207 / 210; headroom 3; pressure RESERVE_ONLY; projected 190/day → 3,713 at period end (no overrun) |

Tick observation after the release is recorded in the P3 final report.
