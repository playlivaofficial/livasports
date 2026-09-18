# Odds reliability SLO & owner runbook (P3)

The promise is **no silent failure + automated recovery + fast owner visibility** — not "100% availability".
Upstream providers, networks, the database and the platform can fail; LivaSports guarantees that such failures are
detected within one scheduler tick, classified as provider-side or internal, recovered automatically when the cause is
under LivaSports' control, and shown to the owner with evidence.

Contract version: `p3.1` (`version` on `GET /api/internal/odds-health` and `GET /api/owner/health`).

## 1. Definitions

| Term | Meaning |
| --- | --- |
| Active competition | Enabled registry competition with at least one `SCHEDULED` fixture inside 14 days (`sports_pending_fixtures` excluded). |
| Usable pregame odds | `odds_current` row: `ACTIVE`, `PREGAME`, `FULL_TIME_REGULATION`, inside its **own** `freshness_ttl_minutes`, provider kickoff within 10 minutes of the fixture kickoff. |
| Any-odds coverage | Fixture has at least one usable quote from either bookmaker (this is what a user sees; a single-bookmaker fixture is shown with the other side as a disclosed PROXY). |
| Betano / Betsson REAL | Fixture has a usable quote from that bookmaker's own feed. |
| Proxy-only | Fixture priced by exactly one bookmaker (the other row is a disclosed proxy). Proxy values are never written to `odds_current`. |
| Neither | Fixture has no usable quote. |
| Stale-only | Fixture has stored rows but none is usable (expired TTL or `CLOSED`). `closedOnly` = every stored row was explicitly closed by the provider feed (provider truth). |
| Urgency tier | Time to nearest kickoff: T0 ≤ 3h, T1 ≤ 12h, T2 ≤ 24h, T3 ≤ 3d, T4 ≤ 7d, T5 ≤ 14d. |

## 2. Horizons

Every metric is computed per competition for the **next 24h / 3d / 7d / 14d** and rolled up per horizon; a global
aggregate never hides a competition-level failure. The owner dashboard summary cards show 24h and 3d any-odds
coverage, 7d bookmaker REAL coverage, proxy share, stale/expired counts, budget, scheduler and catalog state.

## 3. Freshness model

* Freshness is per quote, derived from the TTL stored with the quote (`freshnessTtlMs` at observation, frozen so
  approaching kickoff never shortens an existing quote's life). States: `CURRENT` (< 50% of TTL), `AGING` (< 85%),
  `STALE` (< 100%), `EXPIRED` (≥ TTL or `CLOSED`).
* Expired prices are never resurrected to fill the UI; an expired quote is a refresh gap (`REFRESH_NOT_EXECUTED`)
  when the provider had prices, or provider truth when the feed closed it.
* Metrics: p50 / p95 / oldest current-quote age, aging+stale count, expired count (7-day window).
* Overdue allowance per tier (minutes since last successful refresh): T0 45 · T1 120 · T2 240 · T3 480 · T4 720 · T5 1440.

## 4. Health states

| State | Meaning |
| --- | --- |
| `HEALTHY` | No issue. |
| `DEGRADED` | Warning-level issue (one bookmaker collapsed while the other covers, abnormal proxy share, expired majority, repeated refresh failures, overdue refresh with coverage still present). |
| `CRITICAL` | Internal critical issue: same-day fixtures unpriced while the provider had prices, missing scheduler target with fixtures ≤ 7d, both bookmakers collapsed, budget stop with unpriced near-term fixtures, provider auth failure, integrity failure. |
| `UPSTREAM_UNAVAILABLE` | Refresh works and the provider demonstrably supplies no price (explicit closes, `FIXTURE_NOT_FOUND`, recent snapshot with no near-term prices). |
| `UNMAPPED` | A provider catalog row exists but cannot be mapped uniquely (or no rule resolves it). |
| `UNKNOWN` | Insufficient evidence to separate an internal cause from an upstream one. Never reported as provider absence. |
| `IDLE` | No fixtures inside 14 days (off-season / between rounds). No incident. |

Overall = worst competition state, with platform issues (`SCHEDULER_STALLED`, `PROVIDER_AUTH_FAILURE`) counted as CRITICAL.

## 5. Issue classification (provider truth vs internal failure)

`PROVIDER_NOT_OFFERED` · `PROVIDER_AUTH_FAILURE` · `PROVIDER_RATE_LIMITED` · `PROVIDER_TIMEOUT` · `PROVIDER_SCHEMA_CHANGE` ·
`TARGET_MISSING` · `MAPPING_FAILED` · `REFRESH_NOT_EXECUTED` · `BUDGET_STOPPED` · `NORMALIZATION_REJECTED` ·
`STORE_WRITE_FAILED` · `FRESHNESS_EXPIRED` · `CACHE_READ_FAILURE` · `BOOKMAKER_COLLAPSE` · `PROXY_DOMINANT` ·
`SCHEDULER_STALLED` · `UNKNOWN`.

Evidence order for an unpriced window: ledger/provider error on a feed → expired *active* prices or a recent snapshot
with near-term prices (internal `REFRESH_NOT_EXECUTED`) → every row explicitly closed / `FIXTURE_NOT_FOUND` on every
feed / recent successful snapshot listing no near-term prices (`PROVIDER_NOT_OFFERED`) → overdue refresh
(`REFRESH_NOT_EXECUTED`) → `UNKNOWN`. Classification is stored on every incident and on each rollup row.

## 6. Thresholds (deterministic, no ML)

* Bookmaker collapse: 7d window with ≥ 5 fixtures and the bookmaker's REAL count < 25% of its 24h-ago baseline
  (scaled by the fixture count). Without a baseline, a bookmaker with 0 REAL while the peer prices ≥ 5 is flagged —
  unless the provider reports `FIXTURE_NOT_FOUND` for that feed and it never priced here (then it is a note).
* Proxy dominance: proxy-only share > 80% of priced fixtures **and** baseline share < 40% (sudden). Always-proxy feeds
  are a note, not an incident.
* Expired majority: > 50% of 7d fixtures hold only expired active quotes.
* Repeated failures: ≥ 3 consecutive failures on a feed → classified by its error code.
* Scheduler stall: no automatic invocation for 20 minutes (three missed ticks) while automation is enabled.
* Post-refresh integrity: provider fixtures returned but none mapped (`MAPPING_FAILED`), matched fixtures but zero
  normalized quotes (`NORMALIZATION_REJECTED`), mass close ≥ 10 rows and > 3× the writes (`PROVIDER_NOT_OFFERED`).

Baselines come from `odds_health_rollups` (one row per competition per tick, 14-day retention).

## 7. Automatic recovery (bounded, idempotent, audited)

| Trigger | Action | Bound |
| --- | --- | --- |
| Enabled competition with fixtures ≤ 14d and no catalog row | `/v4/tournaments` catalog expansion | once per 24h, only with verified budget ≥ discovery reserve |
| Feed with fixtures ≤ 72h and no usable coverage | recovery cadence ≤ 6h, leads the queue | proven feeds batch in fours; unproven probes ≤ 2 per bookmaker per tick |
| Kickoff ≤ 12h or recovery feed | urgent batch, nearest kickoff first, may use the 20% urgent reserve | never beyond live ledger headroom |
| Ledger refusal | `BUDGET_STOP` deferred action, retry next tick | no target failure counter is touched |
| Empty feed (`FIXTURE_NOT_FOUND`) | 12h backoff **only** if the feed never succeeded; previously priced feeds keep the 15m→6h ladder | |
| Provider/network error | 15m→6h exponential ladder per target; adapter retries 429/5xx once with backoff | ≤ 6 requests per tick, 2.5s spacing |
| Unmatched catalog row | retained in `odds_catalog_rows` with first/last seen; deterministic rule/lookup-name/unique-name mapping on every expansion; ambiguous rows never auto-map | |

Every action is written to `odds_recovery_actions` (trigger, scope, reason, cost, outcome, next retry, headroom after).

## 8. Budget reservations (`budgetGovernor`)

From the verified subscription period only: routine allowance 4,000 of 5,000; paced daily ceiling
`min(240, routineRemaining / remainingDays)` (ledger-enforced on the rolling 24h of SCHEDULED requests); urgent reserve
20% of the ceiling (routine batches stop at the reserve line); recovery reserve 10% (informational share of the urgent
reserve); discovery reserve 2 requests. Pressure: `NORMAL` → `PACED` (≥ 75% of routine ceiling) → `RESERVE_ONLY`
(headroom ≤ urgent reserve) → `EXHAUSTED`. Projection = 3-day average × remaining days; `projectedOverrun` when it
would exceed the routine allowance. No capacity is ever invented.

## 9. Alerts

* Dashboard: always (`/owner/health`, owner session only, `noindex`, excluded from sitemaps, robots-disallowed).
* E-mail: only when `OWNER_ALERT_EMAIL` is set and the existing SMTP sign-in transport is configured. CRITICAL
  incidents only; one e-mail on open, one on escalation WARNING→CRITICAL, one on resolution of an alerted incident.
  Warnings never e-mail. Deduplication: one open incident per competition + classification (unique index).
* Incident resolution has a 30-minute flap guard; idle (off-season) competitions resolve immediately.
* Retention: rollups 14 d · recovery actions 30 d · resolved incidents 90 d.

## 10. Owner runbook — "What do I do when the dashboard is red?"

Open `/owner/health`, sign in with the owner access key, read the **Open incidents** table, click the competition for
detail (fixtures, quote ages, feeds, last provider requests, scheduler decisions, recovery attempts). No SSH/SQL needed.

| Classification | What it means | Owner steps |
| --- | --- | --- |
| `TARGET_MISSING` | Fixtures exist but no provider catalog row resolves to the competition. | Wait for the next automatic catalog expansion (≤ 24h) or press **Retry catalog mapping**. If the row appears under *catalog rows needing a mapping decision*, add its slug/lookup name to the registry (`footballCompetitions.ts` / identity rules) and release. |
| `PROVIDER_NOT_OFFERED` / `UPSTREAM_UNAVAILABLE` | Provider supplies no price (closed markets, no fixtures listed). | Nothing to fix locally. Public pages show the alternate bookmaker as a disclosed proxy or "unavailable". Re-check later; escalate to the provider only if a major competition stays unpriced within 24h of kickoff. |
| `PROVIDER_AUTH_FAILURE` | Provider returned 401/403. | Check the OddsPapi subscription/key status in the provider console. Do not rotate keys casually; if the key must change, update `ODDSPAPI_API_KEY` in Vercel and redeploy. |
| `BUDGET_STOPPED` / budget pressure | The rolling-day ceiling or period allowance is binding. | The planner keeps a 20% urgent reserve automatically. Check *projected end-of-period usage*; avoid manual targeted refreshes; if overrun is projected, reduce enabled competitions or plan the next period. Never buy capacity from the dashboard. |
| `BOOKMAKER_COLLAPSE` | One or both bookmakers lost REAL coverage vs. yesterday. | Open the competition: check the feed's *latest snapshot* (fixtures/quotes) and *latest request*. If the snapshot has quotes but current rows are missing, run **Targeted refresh** (confirm; costs ≤ 2 requests). If the snapshot has zero quotes, it is provider-side. |
| `STALE_QUOTES` / `FRESHNESS_EXPIRED` | Prices expired before the next refresh. | Look at the *scheduler decisions*: pacing headroom 0 means budget pressure; otherwise **Re-check health** and, if the fixture is within hours, **Targeted refresh**. |
| `REFRESH_NOT_EXECUTED` / `REFRESH_FAILURE` | Target overdue or failing. | Check *Scheduler* card: last tick > 20 min → cron-job.org ticker or deployment problem (see Vercel logs); otherwise inspect the feed's last error and use **Targeted refresh** once. |
| `MAPPING_FAILED` / `MAPPING_FAILURE` | Provider fixtures/tournament cannot be mapped uniquely. | Open the competition: fixture rows show the mapping review state and reason (team names, kickoff mismatch). Fix the registry rule or team alias; ambiguous catalog rows need a decision in the registry. |
| `SCHEDULER_STALLED` | No automatic tick for 20 minutes. | Check cron-job.org (GET `/api/internal/odds-refresh` every 5 min with the bearer secret) and the latest Vercel deployment health. |
| `NORMALIZATION_REJECTED` / `STORE_WRITE_FAILED` | A refresh returned data that produced nothing, or a write failed. | Software issue: capture the incident id and the *recovery attempts* row; ship a fix. Provider truth is never rolled back automatically. |

Manual actions available: **Re-check health** (no provider call), **Retry catalog mapping** (no provider call),
**Acknowledge** (records a human saw it), **Targeted refresh** (one competition, both bookmakers, explicit
confirmation, 15-minute minimum interval per competition, one owner refresh per 5 minutes platform-wide, live
headroom check, worker lock, recorded in the ledger as SCHEDULED). There is no "refresh everything".

## 11. Remaining upstream limitations

* OddsPapi lists later rounds at its own pace (e.g. Champions League ~25 days ahead, Europa League only the current
  round at the time of writing); those fixtures are `UPSTREAM_UNAVAILABLE`, not internal failures.
* Betsson does not price every competition Betano prices (e.g. FA Cup qualifying); proxies are disclosed.
* Catalog expansion is limited to one `/v4/tournaments` call per 24h; a brand-new competition can therefore wait up to
  a day for its first automatic target unless the owner presses *Retry catalog mapping* after an expansion.
* Alert e-mail requires `OWNER_ALERT_EMAIL`; until it is set, alerts are dashboard-only and recorded as such.
