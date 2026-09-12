# M7 comparison engine

## Identity and validation

Input reuses M6 `CanonicalSelection`: 16-character public fixture ID, market, outcome, exact line and `FULL_TIME_REGULATION` scope. Only MATCH_WINNER HOME/DRAW/AWAY with null line, TOTAL_GOALS OVER/UNDER at 2.5, and BTTS YES/NO with null line are accepted. Maximum ten unique fixtures; unknown keys, provider IDs, duplicate fixtures, other markets/lines/scopes and malformed bodies are rejected. Streamed request bodies are bounded to 4,096 bytes. No query parameters or cross-origin browser requests are accepted on comparison POSTs.

## Completeness and math

For each independently eligible bookmaker, the engine matches every exact canonical selection against its own current quotes. No substitution, history fallback, live quote or cross-bookmaker multiplication occurs. Duplicate exact quotes fail closed.

`requiredSelectionCount` is the canonical count; `availableSelectionCount` counts valid current quotes. `missingSelections` contains unresolved/missing entries; `invalidSelections` contains malformed/ambiguous quotes and stale, suspended, closed or started/finished entries. These lists partition noncurrent selections. Every quote also appears in `selectionQuotes`, preserving user order. `complete` requires a nonempty slip and all exact current quotes. Partial totals are null, including 0/N.

Odds are validated fixed decimal strings (greater than 1, at most 1000, up to 18 decimal places). Integer coefficients and decimal scales are multiplied with BigInt; no individual quote is rounded and no floating point multiplication occurs. `2.10 × 1.80 × 1.60 = 6.048`, displayed as `6,05` in BR or `6.05` in MX. Combined results can exceed normal floating point integer precision without loss. Final display rounding is half-up to two decimal places.

With at least two complete bookmakers, exact decimal comparisons identify the highest combined price. Equal exact products receive tie labels. One complete bookmaker has no best badge. Affiliate approval, commission and destination availability do not participate in ranking.

## Freshness

The existing 15-minute observed/last-success freshness policy, mapping evidence, pregame status and both canonical/provider kickoff boundaries apply. Stale, suspended, closed, historical, unknown, invalid timestamp and post-kickoff quotes cannot participate. Expiry is the earliest of both kickoffs and both freshness deadlines. Server results are recomputed at every read. The browser independently rebuilds coverage, totals, best labels and CTA states at known boundary timers, periodic ticks and visibility recovery. Offline/failed resolution removes actionable totals while preserving intent. Prices stay in session memory, never localStorage.

## Read and cache design

A cold comparison uses two bounded parameterized queries: all fixtures/current quotes (maximum 500 rows) and eligible bookmaker/configuration rows (maximum four, normally two). Existing fixture-public-ID, current-quote fixture/selection and mapping indexes support these reads. The planner may choose a scan on tiny tables. There is no selection-by-bookmaker query loop and no history read.

Cache key: `slip-comparison:v1:<locale>:<sorted canonical selection keys>`. Display order is reconstructed separately. Entries live at most 15 seconds and never beyond the earliest participating quote expiry. The cache is bounded to 128 entries and 32 in-flight keys, with duplicate in-flight reads shared. There is no stale-on-error fallback. HTTP responses remain private/no-store. Cache metrics report HIT/MISS/DEDUP, count, locale, duration and providerRequests=0 without private configuration.

The drawer uses one comparison request for both M6 resolution and M7 pricing, with 60-second visible polling and a 15-second minimum between automatic attempts. Closed, empty, hidden and offline drawers do not poll. Provider calls are zero on reads, refresh, mobile interaction and outbound revalidation.
