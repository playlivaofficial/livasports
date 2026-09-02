# LivaSports M1 Architecture

## Scope and status

M1 establishes a production-minded Next.js and TypeScript foundation without building the product UI, Bet Slip, Match Center, accounts, affiliate redirects, live odds, player props, basketball pages, or M2 ingestion jobs. The M0 and M0.5 JavaScript validation harnesses and their generated evidence remain separate and unchanged.

The central design rule is that LivaSports owns every business identifier and domain type. Sportmonks and OddsPapi IDs are external references and may only cross the provider boundary through `provider_entity_mappings`.

## Architecture

```text
Sportmonks API                            OddsPapi API
      |                                        |
HttpSportmonksGateway                 HttpOddsPapiGateway
      |                                        |
SportsDataProvider                         OddsProvider
      |                                        |
SportmonksNormalizer                  OddsPapiNormalizer
      |                                        |
      +-------- provider mappings ------------+
                         |
                LivaSports domain
                         |
          repositories / cache / services
                         |
              Next.js server boundary
                         |
          localized route skeletons only
```

Application code depends on `SportsDataProvider` or `OddsProvider`, never a provider URL. HTTP gateways are server-only modules. Normalizers convert provider payloads to LivaSports entities before services or repositories receive them.

## Provider responsibilities

### Sportmonks

Sportmonks is the sports-data provider for competitions, seasons, teams, fixtures, live/final scores, events, standings, lineups, statistics, head-to-head, and future Match Center data. `SportmonksAdapter` implements the `SportsDataProvider` contract. It maps provider statuses to the LivaSports `FixtureStatus` enum and uses current score records only when the provider supplies them.

Sportmonks odds are not the primary production odds source.

### OddsPapi

OddsPapi is the pregame odds provider for Betano BR (`betano.bet.br`) and Betsson (`betsson`). `OddsPapiAdapter` implements `OddsProvider`. Its HTTP gateway batches tournament IDs while issuing exactly one request per bookmaker, caches shared provider responses, observes a request budget, and never calls per website visitor.

Only `MATCH_WINNER`, `TOTAL_GOALS`, and `BTTS` cross the production normalizer. Double Chance, live odds, player props, and other markets are discarded at the boundary.

### Why two providers

M0.5 established useful Betano BR and Betsson pregame coverage from OddsPapi but not the detailed data required by Match Center. Separating responsibilities avoids coupling match data to odds coverage or affiliate approval. Either provider can later be replaced behind its LivaSports-owned interface and mappings.

## Canonical domain

The canonical model contains:

- `Country`, `Sport`, `Competition`, `Season`, `Team`, and `Fixture` for sports data.
- `Bookmaker`, `BookmakerGeoAvailability`, `Market`, `Outcome`, and `OddsQuote` for comparison.
- `CanonicalSelection` for future slip compatibility: `fixtureId`, `market`, `outcome`, and exact `line`.
- `MatchEvent`, `StandingRow`, `LineupEntry`, and `MatchStatistic` as normalized Match Center boundaries.

IDs are branded internal IDs generated as UUIDs. Provider IDs never become a fixture, team, competition, market, or bookmaker primary key. A future comparison slip is constrained in domain logic to at most one selection per fixture; no Same Game Parlay calculation exists.

Fixture status is normalized to `SCHEDULED`, `LIVE`, `HALFTIME`, `FINISHED`, `POSTPONED`, `CANCELLED`, or `ABANDONED`. It does not mirror either provider's enum directly.

## Provider entity mapping

`provider_entity_mappings` stores:

- provider and entity type;
- provider entity ID;
- LivaSports entity ID;
- provider-specific metadata;
- creation and update timestamps.

Uniqueness is enforced in both directions for each provider and entity type. The service supports lookup by provider reference, reverse lookup by internal ID, and stable get-or-create behavior. OddsPapi fixture metadata may include the tournament ID needed for efficient batched odds retrieval.

An OddsPapi fixture must already be reconciled to a canonical fixture before its quote is accepted. Unknown provider fixtures are returned as unmapped diagnostics; the adapter never substitutes an OddsPapi fixture ID as a LivaSports ID. Cross-provider fixture reconciliation is intentionally an M2 ingestion responsibility.

## Database schema

`db/migrations/001_m1_foundation.sql` is PostgreSQL-ready and creates:

- sports data: `countries`, `sports`, `competitions`, `seasons`, `teams`, `fixtures`;
- comparison: `bookmakers`, `bookmaker_geo_availability`, `markets`, `odds_current`, `odds_history`;
- provider isolation: `provider_entity_mappings`;
- future affiliate support: `affiliate_links`, `affiliate_clicks`.

The migration supplies foreign keys, status and market checks, fixture and odds lookup indexes, exact-current-quote uniqueness, and seeds for Brazil, Mexico, football, Betano BR, Betsson, and the three V1 markets. It intentionally creates no user or account tables. PostgreSQL repository implementations are not part of M1; service and repository contracts make their M2 addition non-breaking.

## Odds normalization and selection correctness

An `OddsQuote` records the internal fixture and bookmaker IDs, canonical market and outcome, exact line, decimal price, provider update time, receive time, and status.

Rules enforced by pure domain functions:

- only `ACTIVE` and fresh quotes are usable;
- `STALE`, `SUSPENDED`, and `CLOSED` quotes are excluded;
- `TOTAL_GOALS` lines match exactly, so Over 2.5 never matches Over 3.5;
- outcomes match exactly, so BTTS Yes never matches BTTS No;
- missing bookmaker quotes remain missing;
- best odds are selected only from usable exact matches;
- no interpolation, bookmaker substitution, or stale fallback occurs.

Freshness is configured with `ODDS_STALE_AFTER_SECONDS`, outside React and domain callers. The default is 300 seconds.

## Cache strategy

`CacheStore` is an asynchronous abstraction that can be backed by Redis later. M1 supplies an in-memory implementation and `CacheCoordinator`, which combines TTL caching with in-flight promise deduplication. Service and gateway keys are deterministic and shared, so concurrent visitors requesting the same fixture or bookmaker batch share one load.

Default TTL policy:

| Data | M1 default | Rationale |
| --- | ---: | --- |
| Competitions | 24 hours | Low-change catalog |
| Teams | 24 hours | Low-change catalog |
| Fixtures | 15 minutes | Schedule changes matter but are not second-by-second |
| Scores | 30 seconds | Future Match Center polling boundary |
| Pregame odds | 5 minutes | Aligns with current freshness and request budget |

Production deployment should replace the process-local cache with a shared store before horizontal scaling.

## OddsPapi request budget

`ProviderRequestBudget` models a monthly limit and exposes used, remaining, and period values. Runtime configuration includes:

- `ODDSPAPI_MONTHLY_REQUEST_LIMIT` (default 5000);
- `ODDSPAPI_MIN_REFRESH_SECONDS` (default 300);
- cache-first loading and concurrent request deduplication.

The in-memory counter is an architectural guard, not billing truth. M2 should persist provider usage centrally or reconcile it with provider account usage. Logs and errors may retain provider name, status, endpoint, safe query fields, and provider error code/message; secret query fields and any echoed credential text are redacted.

## Bookmakers, GEOs, and affiliates

Current comparison bookmakers are:

| Bookmaker | OddsPapi slug | Comparison | Affiliate status |
| --- | --- | --- | --- |
| Betano BR | `betano.bet.br` | Enabled | `NOT_APPLIED` |
| Betsson | `betsson` | Enabled | `ACTIVE` |

Odds availability and affiliate status are independent. `bookmaker_geo_availability` separately records odds, comparison, and affiliate enablement per country with a verification timestamp. No global availability is inferred for Brazil or Mexico.

## Localization and routes

All customer-facing skeleton strings live in locale dictionaries. Brazil uses pt-BR under `/br`; Mexico uses es-MX under `/mx`. There is no English customer-facing route.

M1 route skeletons:

- `/br`, `/br/futebol`, `/br/ao-vivo`, `/br/jogos/hoje`
- `/mx`, `/mx/futbol`, `/mx/en-vivo`, `/mx/partidos/hoy`

These routes prove composition and localization only. They do not fetch or fabricate sports data.

## Validated M0/M0.5 constraints

The approved 20-fixture football sample covered Brasileiro Serie A, Copa do Brasil, Copa Libertadores, and Liga MX Apertura. The comparison denominator was 14 fixtures:

- Betano BR fixture coverage: 12/14 (85.7%).
- Betsson fixture coverage: 7/14 (50%).
- Match Winner: Betano BR 78.6%, Betsson 50%.
- Total Goals: Betano BR 85.7%, Betsson 50%.
- BTTS: Betano BR 78.6%, Betsson 50%.
- Double Chance: 0% usable for both and disabled for V1.

These figures are validation evidence, not guarantees. Runtime pages must display a bookmaker only when a valid fresh quote exists. Basketball remains architecture-ready but has no M1 product route.

## Security boundary

`SPORTMONKS_API_KEY`, `ODDSPAPI_API_KEY`, and `DATABASE_URL` are loaded only by a `server-only` configuration module. HTTP gateways are also server-only. `.env.example` contains placeholders, while `.env` and `.env.*` are ignored except for the example file. No provider credentials are referenced by client components or public environment variables.

## Tests

Automated M1 tests use mocks and fixtures only. They cover mapping stability, Sportmonks fixture normalization, OddsPapi odds and market normalization, per-bookmaker OddsPapi calls, stale/inactive exclusion, best odds, exact totals lines, exact BTTS outcomes, missing coverage, cache deduplication, and safe provider diagnostics. The preserved M0/M0.5 tests remain a separate suite and do not make paid API calls.

## Known limitations and expansion points

- PostgreSQL repositories and transaction-aware ingestion jobs remain for M2.
- Cross-provider competition/team/fixture reconciliation needs deterministic match rules plus an operator-review path.
- The in-memory cache and request counter must become shared infrastructure before multi-instance production.
- Sportmonks event, lineup, standing, and statistic payloads need provider-fixture contract tests against licensed responses before Match Center UI work.
- Affiliate URLs are placeholders; Betano approval is not assumed and no redirect endpoint exists.
- No live odds, player props, Double Chance, basketball pages, slip persistence, accounts, or polished product UI are included.

Future providers, sports, markets, countries, and cache/database implementations can be added through contracts, catalogs, mappings, and repositories without exposing provider IDs to application code.
