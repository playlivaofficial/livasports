# M5 OddsPapi capability evidence

Audit date: 2026-09-12. Existing v4 account, Normal plan, 5,000 requests per subscription month. Soccer (10) and Basketball (11) enabled; M5 requests football only. Pregame enabled; live and player props disabled for both paid bookmakers. No subscription or purchase changes.

## Exact paid feeds

| Feed | Provider slug | Observed fixture domain | Public GEO treatment |
|---|---|---|---|
| Betano BR | `betano.bet.br` | `www.betano.bet.br` | BR only |
| Betsson | `betsson` | `www.betsson.com` | BR/MX unverified; not a regional substitute |

The global bookmaker catalogue is not entitlement evidence. `bookmakerIsActive` alone also does not prove a quote is executable: fixture suspension, market activity and outcome activity are checked independently.

## Audited tournaments

| OddsPapi ID | Exact slug/category | Canonical competition |
|---|---|---|
| 325 | brasileiro-serie-a / brazil | Brasileirão Série A |
| 27464 | liga-mx-apertura / mexico | Liga MX |
| 17 | premier-league / england | Premier League |
| 384 | copa-libertadores / international-clubs | Copa Libertadores |

IDs were resolved against the accessible catalogue, not guessed from another provider. The registry is intentionally bounded for M5; it is not an expansion of provider subscriptions.

## Initial requests: 11 total

1 account; 1 bookmakers; 1 tournaments; 1 markets; 4 successful fixture requests; 1 fixture cooldown failure (429); 2 odds-by-tournaments requests, one per bookmaker. The retry is counted. No live or props endpoint. No further calls were needed for normalization, matching or repeat-ingestion tests.

Initial odds response: Betano BR 44 fixtures, Betsson 50 fixtures. Actual quote/market/active-status coverage and missing selections are generated in `output/m5-coverage-report.json`; feed coverage is not GEO eligibility.

## Response semantics

Fixtures carry `fixtureId`, tournament and participant IDs, full/short participant names, `startTime` in UTC, `statusId`, `trueStartTime` and `trueEndTime`. Standard outcomes are under `players["0"]`; named/player-specific outcomes are rejected. `marketActive`, `active`, `suspended` and `bookmakerIsActive` are required safety signals.

`changedAt` is an odds-change timestamp, not the time of our latest successful fetch. `bookmakerChangedAt` was NULL in the sample and remains optional. `mainLine=false` does not invalidate the explicitly requested total 2.5. Fixture `updatedAt` is not substituted for quote time.

## Documentation

Verified against official v4 [overview](https://oddspapi.io/us/docs), [account](https://oddspapi.io/us/docs/get-account), [fixtures](https://oddspapi.io/us/docs/get-fixtures), [markets](https://oddspapi.io/us/docs/get-markets), [tournament odds](https://oddspapi.io/us/docs/get-odds-by-tournaments) and [quota](https://oddspapi.io/us/docs/requests-and-quota) pages. Some tournament-odds documentation examples use plural `bookmakers`; live v4 account evidence confirms **singular `bookmaker`**, exactly one per request. Comma-separated tournament IDs work. Global capability descriptions and newer v5/B2B documentation are not evidence of this v4 account's access.
