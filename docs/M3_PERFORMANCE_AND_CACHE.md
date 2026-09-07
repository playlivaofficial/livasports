# LivaSports M3 — Performance and Cache

## Audit findings

Before M3, every localized sports route called one joined PostgreSQL query during request-time rendering. There were no provider calls and no N+1 team/competition queries, but `connection()` made every navigation wait for a Vercel function and Neon. The DB query selected `f.*`, live filtering happened after rows reached the service, and no cross-request data-cache boundary existed.

Measured production baseline before optimization:

- `/br/futebol`: 0.38–0.52 seconds TTFB across three requests
- `/mx/futbol`: 0.36–0.38 seconds TTFB across three requests

The route tree is server-first. No sports page or data component is a Client Component. `next/link` and localized `loading.tsx` files already supplied client navigation, automatic production prefetch, and an interruptible loading boundary. Moving the header into a locale layout would require pathname interactivity or duplicate route logic, so M3 kept the small server-rendered header rather than increasing hydration.

## Delivery architecture

```text
controlled Sportmonks sync
  -> PostgreSQL
  -> one joined route query on cache miss
  -> Next.js persistent Data Cache (L2)
  -> in-process TTL/deduplication cache (L1)
  -> consolidated route loader
  -> server-rendered page
```

Ordinary navigation does not instantiate Sportmonks or OddsPapi. Provider access remains confined to explicit ingestion/validation code.

## Cache abstraction

`Cache` exposes `get`, `set`, `delete`, and `getOrSet`. `CacheCoordinator` provides TTL enforcement, concurrent request deduplication, hit/miss diagnostics, targeted deletion, and a bounded stale-if-error copy. It depends on `CacheStore`, so a future Redis store does not require route-service changes.

`NextServerCache` layers the coordinator over Next.js `unstable_cache`, which is the supported database-query cache for this app's non-Cache-Components configuration. The Next layer persists results across requests and deployments; the memory layer prevents repeated work inside one warm function instance.

Keys are deterministic and namespaced under `livasports:v1`, for example:

- `livasports:v1:competition:list:br`
- `livasports:v1:fixtures:today:br`
- `livasports:v1:fixtures:live:br`
- `livasports:v1:fixtures:competition:<id>`
- `livasports:v1:fixture:<id>`
- `livasports:v1:standings:<id>`
- `livasports:v1:odds:<fixture-id>`

## TTL matrix

| Data | TTL | Reason |
| --- | ---: | --- |
| Competitions | 24 hours | Structure changes rarely |
| Teams | 24 hours | Identity/image data is stable |
| Upcoming fixtures | 15 minutes | Schedule changes are occasional |
| Finished fixtures | 6 hours | Results are effectively immutable after settlement |
| Today/home route | 2 minutes | Keeps the daily slate responsive without per-view DB work |
| Football route | 5 minutes | Broader window can tolerate a longer cache |
| Live route/scores | 30 seconds | Short but contains no browser/provider polling |
| Standings | 10 minutes | Table movement is match-driven |
| Pregame odds | 5 minutes | Preserves OddsPapi minimum refresh discipline |

Non-live route data may serve a last-known value for up to 24 hours if PostgreSQL refresh fails. Live fallback is limited to two minutes. Stale results are explicitly marked and stale odds remain excluded from ranking.

## Route loaders and DB work

`M3RouteDataLoader` owns the route key, TTL, cache tags, timing, DB read, and fallback. Named entry points exist for all Brazil/Mexico home, football, today, and live pages. Each cache miss calls `DatabaseM2ReadService` once; that service calls the repository once.

The repository query uses explicit fixture columns and joins competition/home/away team names in one round trip. Live pages pass `LIVE`/`HALFTIME` to PostgreSQL rather than filtering an entire window in memory. Migration `003_m3_delivery_indexes.sql` adds country lookup, active-refresh, and latest-success health indexes without changing migrations 001 or 002.

## Navigation and loading

Routes remain dynamic so builds never depend on Neon availability or bake an error/empty database response into static HTML. Cached database results still persist through Next's Data Cache. Existing `Link` navigation keeps production prefetch enabled, and the localized `loading.tsx` boundary provides immediate, interruptible feedback. No additional client bundle or hydration tree was introduced.

Optional `pnpm run cache:warm` requests the four critical Brazil routes after deployment. It makes no provider calls. Mexico is not proactively warmed while provider coverage is empty.

## Controlled score refresh and invalidation

Score sync selects only `SCHEDULED`, `LIVE`, and `HALFTIME` fixtures between two days ago and two days ahead, capped at 50 per provider batch. It never scans or deletes history and has no loop/scheduler.

Competition sync invalidates only competition-list tags. Team, fixture, and score changes invalidate the appropriate Brazil/Mexico today, live, broad fixture, and changed fixture tags. `NextCacheInvalidator` uses `revalidateTag(..., 'max')` when the job runs in a Next server context; the standalone CLI remains safe and relies on bounded TTL because it cannot mutate another Vercel instance's Data Cache.

## OddsPapi protection

Page runtime references neither OddsPapi nor its credential. OddsPapi's gateway retains monthly budget enforcement, batching, minimum TTL, and concurrent deduplication. M3 adds sanitized request-budget and cache-status diagnostics inside that gateway. No OddsPapi request was made for M3.

## Observability and health

Sanitized structured logs cover cache hit/miss/set/delete/stale, route data-load duration, DB operation/duration, provider request count (always zero on routes), sync duration, sync result, and provider budgets. Keys contain only canonical route/entity identifiers.

`GET /api/internal/health` returns only database/cache availability, last successful fixture/score sync timestamps and ages, and provider-configuration booleans. It never returns environment values and is `private, no-store` with `noindex` headers.

## Performance validation

Local production-server measurements against Neon:

| Route | Cache | DB calls | Data-load duration | HTTP total |
| --- | --- | ---: | ---: | ---: |
| `/br/futebol` first | MISS | 1 | 1248.2 ms (cold Neon connection) | 1332 ms |
| `/br/futebol` second | HIT | 0 | 0.4 ms | 15 ms |
| `/mx/futbol` first | MISS | 1 | 172.1 ms | 179 ms |
| `/mx/futbol` second | HIT | 0 | 0.3 ms | 6 ms |

Provider calls were zero on every request. These local numbers are directional and include network/connection conditions; correctness and query counts matter more than synthetic scoring.

Production Vercel logs confirmed the same behavior. A cold Mexico football request executed one 53.6ms DB query and completed the loader in 68.6ms; the next two loader calls were cache hits at 0.8ms and 0.6ms with no DB query. Warm Brazil football loader calls were 0.6ms with no DB query. External curl TTFB remained approximately 0.33–0.76 seconds because it also includes network and Vercel function delivery overhead; M3 does not claim that this fixed platform overhead disappeared.

## Known limitations and M3.5 handoff

- The L1 cache is per process. Next Data Cache is the shared no-extra-cost L2; Redis remains optional for a later scale threshold.
- Standalone CLI invalidation cannot directly invalidate another deployed function's memory. Short TTLs and Next-context invalidation cover the current manual model.
- There is no scheduler, WebSocket, or browser live polling.
- Sportmonks still returns no accessible Liga MX league in the current subscription, so Mexico remains a localized empty state with no fabricated data.
- M3.5 may replace the visual system and layouts, but it should preserve the server-first loader, cache keys, loading boundary, and zero-provider-navigation rule.
