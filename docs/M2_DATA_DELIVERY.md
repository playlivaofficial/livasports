# LivaSports M2 Data Delivery

## Scope

M2 turns the eight localized M1 routes into a server-rendered, read-only football experience. It delivers real competitions, fixtures, canonical match states, scores when supplied by Sportmonks, and supported pregame odds when OddsPapi coverage can be matched safely. It does not implement a Bet Slip, full Match Center, live odds, player props, Double Chance, accounts, affiliate tracking, or basketball pages.

## Route behavior

| Route | Locale and time zone | Behavior |
| --- | --- | --- |
| `/br` | pt-BR, `America/Sao_Paulo` | Brazil overview with current local date and separated live, upcoming, and finished fixtures. |
| `/br/futebol` | pt-BR, `America/Sao_Paulo` | Upcoming and recently finished football fixtures grouped by competition. |
| `/br/ao-vivo` | pt-BR, `America/Sao_Paulo` | Only canonical `LIVE` or `HALFTIME` fixtures. |
| `/br/jogos/hoje` | pt-BR, `America/Sao_Paulo` | Fixtures inside the Brazil local calendar day. |
| `/mx` | es-MX, `America/Mexico_City` | Mexico overview with current local date and separated match states. |
| `/mx/futbol` | es-MX, `America/Mexico_City` | Upcoming and recently finished football fixtures grouped by competition. |
| `/mx/en-vivo` | es-MX, `America/Mexico_City` | Only canonical `LIVE` or `HALFTIME` fixtures. |
| `/mx/partidos/hoy` | es-MX, `America/Mexico_City` | Fixtures inside the Mexico local calendar day. |

An empty result is rendered as a localized empty state. It is not converted into mock data or a provider failure. All eight routes have localized titles, descriptions, canonical URLs on `https://livasports.com`, language alternates, and server-rendered content. Preview deployments use the same production canonical URLs and are marked non-indexable outside Vercel production.

## Data flow

```text
Sportmonks API -> HttpSportmonksGateway -> SportmonksAdapter
                                                 |
                                                 v
                                  canonical competitions, teams, fixtures
                                                 |
OddsPapi API -> HttpOddsPapiGateway -> OddsPapiAdapter
                                                 |
                         conservative competition/team/time reconciliation
                                                 |
                                                 v
                                      canonical fresh odds quotes
                                                 |
                                M2DataDeliveryService + cache
                                                 |
                                  provider-neutral server view models
                                                 |
                                     React Server Components
```

Provider payloads, URLs, credentials, and raw IDs stop at their adapters. Components receive only LivaSports-owned view models.

## Provider responsibilities

Sportmonks remains the sports-data provider for competitions, seasons, teams, fixtures, status, and scores, and is the future contract boundary for events, standings, lineups, statistics, and head-to-head. M2 uses its sports-data endpoints only; it does not use Sportmonks as the production odds source.

OddsPapi remains the pregame-odds provider for Betano BR (`betano.bet.br`) and Betsson (`betsson`). M2 requests exactly one bookmaker per provider request and accepts only `MATCH_WINNER`, `TOTAL_GOALS`, and `BTTS`. Live odds, player props, Double Chance, unsupported bookmakers, and unsupported sports are not requested or normalized.

## Canonical normalization and fixture matching

The Sportmonks adapter maps provider competitions, seasons, teams, fixture IDs, scores, and status codes to canonical entities and mappings. Unknown status codes are not inferred as live. Only canonical `LIVE` and `HALFTIME` states may appear on a live route.

OddsPapi tournament IDs are isolated in the provider adapter. An OddsPapi fixture is joined only when all of these conditions hold:

- its tournament maps to the canonical competition;
- ordered home and away team names match after conservative normalization;
- kickoff is within 15 minutes of the Sportmonks fixture;
- exactly one candidate survives.

Ambiguous and unresolved matches are rejected. Team names alone are insufficient. A provider fixture ID is never substituted for a canonical fixture ID, and raw provider IDs never enter public URLs or client-facing models.

## Cache and request-budget protection

The existing `CacheCoordinator` supplies TTL caching and in-flight request deduplication. Current defaults are:

| Data | TTL |
| --- | ---: |
| Competitions | 24 hours |
| Teams | 24 hours |
| Fixtures | 15 minutes |
| Live score view | 30 seconds |
| Pregame odds | 5 minutes |

OddsPapi additionally uses its configured minimum refresh interval and `ProviderRequestBudget` with the current 5,000-request monthly ceiling. The budget is checked before each provider request. Its process-local counter is a guardrail, not provider billing truth, so production billing should also be reconciled with the provider account. The in-memory cache deduplicates one process; a shared cache is still required before multi-instance polling is introduced.

Provider calls execute only after Next.js `connection()` confirms a real request. Static build, typecheck, lint, and automated tests use no paid calls. The build succeeds when either credential is absent.

## Freshness and rendering rules

Sports snapshots and odds expose internal `fresh`, `stale`, or `unavailable` states. Odds are usable only when active, exact, and no older than `ODDS_STALE_AFTER_SECONDS` (300 seconds by default). `TOTAL_GOALS` is displayed only for the exact 2.5 line. Stale odds may trigger a notice but are not displayed as a current price.

Each fixture safely supports both bookmakers, only Betano BR, only Betsson, or no supported odds. Partial coverage is explicit. OddsPapi failure does not hide valid Sportmonks fixtures. Sportmonks failure does not cause OddsPapi fixtures to be promoted into fake sports data. A last valid process-local sports snapshot may be shown as stale when available; otherwise the localized unavailable state is rendered.

## Localization and accessibility

All visible reusable-component text is sourced from complete pt-BR and es-MX dictionaries. Dates and kickoff times are formatted with the locale policy above, not the server UTC date. Fixtures have semantic sections and headings; navigation exposes an accessible label; status and provider notices are textual rather than color-only.

## Security boundary

`SPORTMONKS_API_KEY` and `ODDSPAPI_API_KEY` are read only in a `server-only` runtime module. Neither uses `NEXT_PUBLIC_`. Authorization headers, environment variables, database URLs, provider responses, and internal budget state are not serialized to components. Provider diagnostics retain only provider name, sanitized endpoint/query context, HTTP status, safe error code/message, and request counts. Local `.env` files and time-sensitive provider reports remain ignored.

The production bundle is scanned for credential variable names, `NEXT_PUBLIC_` credential references, and secret values. Missing credentials are a supported runtime condition and produce a localized unavailable view rather than a build failure.

## Database and persistence

M2 reuses `db/migrations/001_m1_foundation.sql` unchanged. No schema addition was necessary, so no `002_m2_data_delivery.sql` was created. The initial read-only delivery path uses canonical in-memory mappings/cache and does not require a production database to render a safe fallback. Persistent repositories, mapping review, distributed cache, and centralized provider-budget accounting remain future infrastructure work.

## Deployment behavior

The application builds without provider credentials and performs no paid call during build. Real provider access happens at request time on the server. M2 must be deployed only to the existing Vercel project connected to `playlivaofficial/livasports`; the existing `livasports.com` domain and DNS configuration are preserved. Production verification targets the custom domain, not merely a generated Vercel URL.

## Known limitations

- Runtime cache, canonical mappings, and request-budget state are process-local and reset when a server instance restarts.
- Conservative fixture matching intentionally trades some odds coverage for correctness.
- Odds availability is provider coverage, not evidence of bookmaker GEO eligibility or affiliate approval.
- Sportmonks advanced Match Center contracts exist, but M2 does not render events, standings, lineups, statistics, or H2H.
- The seven-day football view can legitimately produce no Mexico sample or no supported odds.
- M3 work is intentionally not included.
