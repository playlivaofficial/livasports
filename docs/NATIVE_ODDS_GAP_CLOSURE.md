# Native odds backoff and multi-source boundary

## Scope and truth contract

This change closes the generic-backoff ambiguity and prepares a second native odds supplier without enabling one. Public bookmaker identity remains independent from data-supplier identity. Public cards remain Betsson, Sportingbet BR and betboo BR; Betano remains hidden insurance. A supplier can only be enabled in the server-side source registry after its bookmaker identity, fixture mapping and market semantics have been reviewed. No price is copied from one bookmaker and called native for another.

Monitoring, the owner dashboard and the audit script remain database-only. They consume zero provider requests. Ordinary navigation remains DB/cache-first and never calls OddsPapi or a future supplier.

## Failure-proportional backoff

Every target now persists an exact failure class, exact subreason, evidence and next recheck timestamp. Backoff is target-local.

| Failure | Policy |
|---|---|
| Never-successful isolated 404 | `HTTP_404_TARGET_NOT_FOUND`, 12-hour hard recheck |
| 404 after a prior success | `EMPTY_TEMPORARY_RESPONSE`, 30 minutes |
| Provider 5xx | bounded 5/10/20/40/60-minute ladder |
| Network/timeout | bounded 5/10/20/40/60-minute ladder |
| 429 | hard 15/30/60/120-minute ladder |
| 401/403 | hard six-hour protection; no blind retry |
| Mapping/market defect | classified explicitly; never hidden as target cooldown |
| Repeated no-change | 30 minutes |

Each target receives deterministic 0–4 minute jitter. A recent native target, a fallback-dependent target, a near-kickoff target, or a quote near expiry may safely re-enter earlier only when the failure class is transient/transport/no-change. Hard 404, authentication, rate-limit and circuit-breaker state is never bypassed. The existing request ledger, forecast ceiling, rolling 80% stop, six-request run cap, lease and overlap guards still win.

A successful response resets failure metadata immediately. Recovery order remains expiry rescue, recently-native recovery, missing native coverage, nearest kickoff, and existing native priority. This accelerates recovery without a simultaneous flood.

## Current evidence

The pre-change 210 `TARGET_BACKOFF` selections were not quota-delayed and were not a broad scheduler failure. All were exactly three public target cohorts: Copa del Rey tournament 329 × Betsson, Sportingbet BR and betboo BR, 70 selections/10 fixtures each. Each target had no prior successful odds response and its latest isolated request returned OddsPapi HTTP 404. The same 404 did not suppress any other tournament or bookmaker.

After migration 033, generic `TARGET_BACKOFF` and `QUOTA_OR_BACKOFF_DELAY` are both zero. The same 210 selections remain honestly unavailable as `PROVIDER_GAP`, with delay subreason `HTTP_404_TARGET_NOT_FOUND` and their next bounded probe visible. This is a classification correction backed by request evidence, not a native-coverage gain. It made no manual provider call and recovered zero prices because no native prices existed to recover.

At the 2026-09-21 12:39 UTC database-only sample, the remaining hard cohort averaged 475 minutes to its scheduled recheck (median 500). The earlier 12:23 UTC sample averaged 492 (median 517); the decrease is elapsed wall time, not a shortened hard-error policy.

## OddsPapi exhaustion check

The saved account catalog contains only the exact canonical football markets currently used: 101 (full-time 1X2), 104 (BTTS), and 1010 (full-time total 2.5). The normalizer can now discover an alternate ID only when the saved provider catalog proves exact soccer, full-time, non-player-prop name/type/line/outcome semantics. No alternate canonical ID was present. The existing endpoint already returns all bookmaker markets at verbosity 3, batches tournament IDs, and does not apply a narrow market filter. Cached payload and diagnostic evidence therefore support the remaining gap classification without another provider request.

OddsPapi documents the tournament endpoint as returning bookmaker markets/options/prices and charges one request per endpoint call regardless of response size or error status. These facts are why validation reuses stored payloads and why 404 rechecks remain sparse:

- https://oddspapi.io/en/docs/get-odds-by-tournaments
- https://oddspapi.io/us/docs/requests-and-quota

The original 376 provider-gap selections remain upstream gaps in the current feed. The largest cohorts are Sportingbet 1X2 in Brasileirão Série B (30), La Liga 2 (30), and Liga MX (21); Betsson BTTS in MLS (32), Série B (20), La Liga 2 (20), and Liga MX (18); and betboo Liga MX 1X2 (21). Separate suspended/removed selections are not counted as provider gaps.

## Multi-source persistence and resolution

Migration `033_native_source_backoff_hardening.sql` adds source-aware current/history tables keyed by supplier, canonical fixture, canonical bookmaker and canonical selection. The existing OddsPapi table remains the primary materialization, and its rows are backfilled into the new audit store without widening public eligibility.

The adapter contract requires:

- supplier fixture ID plus verified canonical fixture ID;
- supplier bookmaker ID plus canonical bookmaker ID;
- canonical market/outcome plus supplier market ID;
- observed/provider-update times, source domain, TTL and confidence;
- independent persistence per supplier.

For a bookmaker market, resolution selects one supplier snapshot. Ranking is deterministic: complete market, most active selections, freshest observation, then configured supplier priority. A partial 1X2 from provider A is never completed with provider B. Ambiguous duplicate selections publish nothing. Stored quotes from each supplier remain separately auditable. Only `ODDSPAPI` is currently approved and enabled.

## Secondary-provider evaluation

No provider was purchased, subscribed to or activated.

1. **Sportingbet BR first-party Sports API — strongest Sportingbet-native candidate.** Its official API documents pre-match fixture responses containing markets, options and prices, fixture/competition filters and incremental `since` retrieval. Access requires legal approval and issued Access ID/token. This is promising for Sportingbet BR but is not evidence for Betsson or betboo. Integration effort is medium/high because its fixture, competition and market identities require canonical mapping. Public pricing is not documented.
   - https://sportsapi.sportingbet.bet.br/restapi/swagger.html
   - https://sportsapi.sportingbet.bet.br/articles/getinvolved.html
2. **SportsGameOdds — Betsson evaluation candidate only.** Its public bookmaker registry lists Betsson, but not Sportingbet BR or betboo BR. The current public pricing page lists Rookie at US$99/month (100k objects, 50 requests/minute, three-minute updates, 17 leagues/77 bookmakers) and Pro at US$299/month (unlimited objects, 300 requests/minute, sub-minute updates, 53 leagues/82 bookmakers). Brazil/Mexico competition depth and BR Betsson semantics still require a no-cost coverage proof before consideration.
   - https://sportsgameodds.com/bookmakers
   - https://sportsgameodds.com/pricing
3. **Sportradar Odds Comparison Core — enterprise evaluation candidate.** Official documentation describes 140+ global bookmakers and soccer 1X2, totals and BTTS, but coverage is feed-driven and the public material reviewed does not verify the three exact BR bookmaker identities. Access is support-enabled and public pricing was not found. Integration effort is high.
   - https://developer.sportradar.com/odds/reference/oc-core-overview

The next external step is a written coverage sample/contract for exact BR domains, competitions and markets. No supplier should be enabled from a marketing bookmaker count alone.

## Budget effect

Normal cadence is unchanged. The post-change live fixture-window simulation is 113 requests/day average and 180 peak against 275/day, with 58.9% average reserve and 34.5% peak reserve. The supplied baseline was 113/day average and 176 peak; the four-request peak movement reflects the later fixture/time snapshot, not extra steady-state polling. Hard 404 targets are not re-polled early. Consequently, expected additional normal requests/day from this change are zero. During an actual transient outage, only affected targets may re-enter at the bounded ladder, subject to all existing caps.

## Operational verification

- Migration 033 is additive and idempotent; a second migration run must apply zero files.
- Database integrity must retain zero duplicate, invalid, orphan or unapplied odds rows and zero stale jobs.
- The database-only audit writes ignored private evidence and reports `providerRequests: 0`.
- Public navigation and comparison reads must report `providerRequests: 0`.
- Production acceptance must confirm owner source health, exact deferral labels and no public supplier branding.

