# LivaSports M4.1 — Team & Player Profiles

## Status

M4.1 adds canonical, localized team and player profiles to the existing M3.6/M4 product. Profile pages are useful sports pages without odds or affiliate content and follow the same database/cache-first boundary as Match Center.

Ordinary navigation is:

```text
Browser -> canonical route guard -> profile cache -> Neon
                                               -> provider calls: 0
```

## Public identity and routes

LivaSports owns every public identity. Sportmonks identifiers remain in provider-mapping tables and never appear in customer-facing URLs.

- PT-BR team: `/br/time/<readable-slug>-<public-id>`
- ES-MX team: `/mx/equipo/<readable-slug>-<public-id>`
- PT-BR player: `/br/jogador/<readable-slug>-<public-id>`
- ES-MX player: `/mx/jugador/<readable-slug>-<public-id>`

Team and player public IDs are persisted 16-character identifiers. A name or slug change does not change identity. Wrong descriptive slugs receive HTTP 308 redirects to the current canonical URL. Unknown/malformed IDs receive a genuine HTTP 404 before the streamed page shell. Database failure continues to the error boundary and is not converted into a false 404.

The BR/MX switch keeps the same canonical entity. Same-name players remain distinct because the route identity is the public ID, not the display name. Season, jersey number, and current club are not part of player identity.

## Team profile

The team page renders persisted data only:

- provider crest with an initials fallback;
- team identity, country, founded year, venue, and verified coach when present;
- active/relevant competition and season contexts;
- next fixture and recent completed results linked to Match Center;
- stage/group-aware standings where stored and applicable;
- season squad grouped into goalkeepers, defenders, midfielders, forwards, and unknown only when needed;
- known team statistics separated by competition, season, and team context.

No missing value is presented as zero. A knockout-only or unavailable standings context is labeled honestly. Coach names are omitted because none were verified in the controlled response sample.

## Player profile

The player page renders persisted identity and football evidence:

- provider photo or initials fallback;
- display name, verified current squad context, nationality, position, birth date, computed age, height, and weight when present;
- season/team/competition contexts kept separate;
- whitelisted, meaning-known season statistics;
- recent match appearances derived from persisted lineups or fixture-player statistics;
- real minutes, goals, assists, cards, shots, saves, and provider rating when available;
- links back to the canonical team and M4 Match Center.

Rating uses the provider `average` value ahead of `total`. Verified zero values remain zero; absent values remain absent.

## M4 integration

Match Center now links:

- both teams from the match header;
- teams from applicable standings rows;
- linked starters and substitutes;
- linked event players and related players;
- fixture-level player-performance rows.

The existing match layout and modules are preserved. The additional fixture-player-statistics module has an isolated versioned cache key, so a profile enhancement does not make ordinary navigation call a provider.

## Data states

Profile modules use:

- `AVAILABLE`
- `PARTIAL`
- `NOT_YET_INGESTED`
- `NOT_COVERED`
- `NOT_APPLICABLE`
- `ERROR`
- `STALE`

A partial lineup-linked player may have a useful match log but no biography/photo. That page renders the real evidence, uses the initials fallback, and is `noindex` until it satisfies the persisted-content threshold.

## Verified responsive behavior

The actual rendered pages were inspected at 1440, 768, 430, 390, and 375 pixels. Team and player names wrap, the five team tabs fit at mobile widths, squad/statistic grids collapse cleanly, provider images fall back without broken-image UI, and no page-level horizontal overflow was observed.

## Current rollout boundary

All 1,343 canonical teams have stable public routes and can use already persisted fixtures/results. Controlled detailed enrichment covers Flamengo, América, and Fulham. The wider 1,343-team profile backfill is intentionally staged; profile pages distinguish unavailable data from not-yet-ingested data, and user requests never trigger enrichment.
