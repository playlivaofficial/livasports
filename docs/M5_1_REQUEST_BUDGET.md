# M5.1 — Request budget

## Verified account and economics

Current subscription window is **2026-09-02 11:10:51 UTC to 2026-10-02 11:10:51 UTC**, not a calendar month. Controlled account reconciliation on September 12 returned 64 provider-reported consumed requests. M5's conservative external baseline of 50 was preserved, rather than reducing previously reserved headroom.

OddsPapi [quota documentation](https://oddspapi.io/us/docs/requests-and-quota) says each billable endpoint attempt counts regardless of response size/status, and `/v4/account` is unmetered and remains available after exhaustion. The [account endpoint](https://oddspapi.io/us/docs/get-account) supplies subscription dates and counters; its generic “1 API request” note is an HTTP-call count, not an assumption that account checks consume quota. We report HTTP calls separately from billable reservations. Unknown/network failures remain conservatively charged.

`odds-by-tournaments` accepts one singular `bookmaker` and comma-separated tournament IDs. Therefore one response can refresh many fixtures for every user. Never multiply its cost by fixture or visitor count. [Endpoint documentation](https://oddspapi.io/us/docs/get-odds-by-tournaments).

## Actual inventory and cadence

Dry run at 2026-09-12 12:44 UTC: 68 upcoming canonical fixtures in the four audited competitions: Brasileiro Série A 19 (325), Liga MX 25 (27464), Premier League 20 (17), Libertadores 4 (384). Only 50 have existing OddsPapi fixture mappings; unmapped fixtures are not fictitious coverage and strict mapping remains unchanged.

| Target | Interval | Notes |
|---|---:|---|
| More than 48h | 24h | Low-priority shared discovery |
| 12–48h | 120m | Only due targets |
| 2–12h | 60m | Budget-limited; honest stale gaps |
| Within 2h | 15m for one public feed; 30m for two | Five-minute scheduler tick may add up to five minutes latency |
| Final 15m before kickoff | Same bounded near-kickoff cadence | No aggressive last-second polling |
| At/after kickoff, finished, terminal | Stop | Excluded even if stored status lags |
| GEO-gated or no useful current coverage | 24h | Betsson currently uses this tier |
| Failure | One immediate retry, then persistent 15–360m backoff | Every attempt reserved |

Fewer refreshes never extend the 15-minute expiry. This is a cost-sensitive policy, not an always-fresh guarantee.

## Envelope

- One public feed at 15m all day: 2,880 calls/30 days. Two public feeds at 30m have the same base cost.
- Staggered tournament due times, daily probes and retries are bounded by **100 billable routine calls per rolling 24h**, independent of browser traffic: maximum 3,000/30 days (3,100/31).
- Separate planning reserve: diagnostics 50, retries 100, fixture discovery 100, mapping reconciliation 50, manual emergencies 50 = **350**. This conservative estimate includes retry headroom even though routine retries also count toward the rolling cap.
- Original conservative known usage 65 + 3,000 + 350 = **3,415/30-day planning envelope**. Actual usage after controlled checks is recorded in the final report.
- Routine lifetime stop: **4,000** including external baseline and all local counted calls. Internal absolute stop: **4,500**. Paid plan: **5,000**. No automatic escalation into the reserved band.
- Read-only simulation of the frozen real inventory through the actual reset: **641** predicted future billable calls, max 71/day. No new future fixture arrivals were invented; this is an inventory forecast, not a subscription-wide promise. Raw daily simulation stays in ignored operator evidence.

## Reconciliation and resets

Durable rows retain exact provider period start/end, verified/reconciled time, reported provider usage, external baseline, completed/reserved/failed local attempts and unmetered checks. Each reservation counts before fetch; retries cannot race the limit. External floor becomes the greater of its previous value and provider reported count minus known local counted calls. It never decreases within a period. Existing M5 audit accounting stays conservatively intact.

Account refresh is daily when due work exists, with a one-hour durable cooldown on reconciliation attempts. Only this documented unmetered endpoint may run if no current budget window exists. New windows must be explicit, current, <=32 days, non-overlapping and have an integer usage counter. Missing/unbounded/overlapping windows or scope drift fail closed as BUDGET_STOPPED. No local timezone or first-of-month counter reset exists. A subscription that renews without a clearly bounded current period requires operator/provider clarification, not a guessed reset.

External clients can consume quota between reconciliations. The conservative floor, daily reconciliation, internal headroom and provider quota enforcement mitigate this; exact instantaneous external use cannot be inferred from local records.
