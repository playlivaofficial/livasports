# LivaSports M4 — Match Center

## Status

M4 adds database-backed match pages for PT-BR and ES-MX without changing the M3/M3.6 competition-navigation architecture. Ordinary page requests read Neon and the server cache only; they never call Sportmonks or OddsPapi.

## Public routes and identity

- PT-BR: `/br/jogo/<home>-x-<away>-<public-id>`
- ES-MX: `/mx/partido/<home>-x-<away>-<public-id>`
- `public-id` is a persisted, unique 16-character LivaSports identifier. It does not expose a provider ID.
- Team-name changes do not break identity. A stale or incorrect slug receives an HTTP 308 redirect to the current canonical slug.
- Unknown or malformed IDs receive a real HTTP 404 before the streamed page shell starts.
- A database failure is allowed through to the route error boundary and is never converted into a false 404.

The pre-render route guard is implemented with the Next.js 16 `proxy.ts` convention because Next.js documents that streamed `notFound()` responses keep HTTP 200; Proxy runs before rendering and can return a real status. The indexed guard query reads only the canonical fixture and team names.

## Read architecture

```text
Browser -> canonical route guard -> MatchCenterLoader -> module caches -> Neon
                                                     -> provider calls: 0
```

Header, module states, events, statistics, lineups, standings, form/H2H, and eligible pregame odds have separate cache keys and TTLs. Sibling modules use independent settled reads: one failed module becomes `ERROR` while the rest of the page remains usable. Cache entries retain a bounded stale-on-error copy for database interruptions.

Normal navigation does not instantiate either provider adapter. The live browser boundary polls only the LivaSports database endpoint and only when the stored match state is `LIVE` or `HALFTIME`. It compares the durable database snapshot timestamp, so refresh detection remains reliable even when the provider omits its own update timestamp.

## Match states and scores

- `SCHEDULED`: score placeholders are muted; events/statistics/lineups state is `NOT_YET_AVAILABLE` when the controlled provider snapshot contains no rows.
- `LIVE` / `HALFTIME`: the page may poll the internal read endpoint every 30 seconds while visible and online. A provider snapshot older than 90 seconds is explicitly labeled stale.
- `FINISHED`: final stored score is emphasized and the historical snapshot does not age into a false stale state.
- `POSTPONED`, `CANCELLED`, `ABANDONED`: existing localized fixture status labels remain authoritative.
- The primary score uses Sportmonks' canonical `CURRENT` score. Penalties, extra time, and aggregate values remain separate labeled score components when provided; they are never added together.

## Modules

- Summary: competition, season, round, stage, venue, kickoff, score components, and the complete non-rescinded event timeline.
- Statistics: all persisted match statistics, with priority metrics first and all observed provider labels localized for PT-BR and ES-MX.
- Lineups: starters, substitutes, jersey numbers, formation, and coach only when supplied.
- Form and H2H: bounded prior finished fixtures already stored in Neon. Sample size is shown and missing history is explicit.
- Standings: persisted season/stage/group snapshot. Domestic cups return `NOT_APPLICABLE` where a league table is not meaningful.
- Odds: strict pregame-only boundary. Quotes must be active, younger than 30 minutes, on an enabled market/line, and verified for the route GEO. Affiliate URLs appear only when both bookmaker/GEO and link states are enabled. No eligible quote means an honest localized empty state.

Module states are: `AVAILABLE`, `NOT_YET_AVAILABLE`, `NOT_COVERED`, `NO_DATA_IN_WINDOW`, `NOT_APPLICABLE`, `ERROR`, and `STALE`. No empty state creates synthetic data.

## Persistence and recovery

Migration `006_m4_match_center.sql` adds public identity, match context, scores, events, statistics, lineups/formations/coaches, standings snapshots, module freshness state, sync leases, and product events.

The controlled enrichment job:

- rejects a second active lease;
- heartbeats after every completed fixture;
- records a durable cursor and request count;
- reclaims an expired or failed partial job from that cursor;
- uses transactional module writes and provider-scoped upserts;
- preserves the last successful snapshot when a later module refresh fails.

The migration runner records filenames in `schema_migrations`. A second run returned an empty applied list, confirming migration idempotency.

## SEO and localization

- Localized title and description.
- Canonical URL and PT-BR/ES-MX alternate links.
- `SportsEvent` and breadcrumb JSON-LD built from stored data.
- Database-driven sitemap entries for both locale URLs.
- Locale switch keeps the same match identity.
- Unknown match pages are `noindex`.

## Local visual and route QA

Verified real database-backed examples:

- Brazil scheduled: Flamengo x Independiente del Valle.
- Brazil finished/rich: Vitória x Grêmio.
- Mexico finished/rich: Cruz Azul x Santos Laguna.
- Clearly labeled historical live replay: development-only route; it is a 404 in production.

Widths inspected: 1440, 768, 430, 390, and 375 pixels. Document/body width remained equal to the viewport. Tabs and standings intentionally scroll inside their own bounded containers; there was no page-level horizontal overflow and no broken team images.

## Source references

- [Sportmonks fixture entity](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/fixture)
- [Sportmonks fixtures endpoints](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures)
- [Sportmonks scores include](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/scores)
- [Sportmonks lineups include](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/lineups)
- [Sportmonks H2H endpoint](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-head-to-head)
- [Next.js `notFound` streaming status behavior](https://nextjs.org/docs/app/api-reference/functions/not-found)
