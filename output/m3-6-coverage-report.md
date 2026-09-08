# LivaSports M3.6 — Sportmonks Competition Coverage Report

Generated: 2026-09-07T18:09:02.776Z
Controlled window: 2026-08-31 → 2026-09-28
Sportmonks requests consumed: 21
Account-accessible leagues returned: 34

## Summary

- SUPPORTED: 26
- SUPPORTED_BUT_NO_CURRENT_FIXTURES: 8
- NO_SUBSCRIPTION_ACCESS: 0
- NOT_FOUND: 0
- AMBIGUOUS_MAPPING: 0

## Approved 34-competition validation

| # | Requested competition | Sportmonks match | Provider ID | Country/region | Current/relevant season | Fixtures | Classification |
| ---: | --- | --- | ---: | --- | --- | ---: | --- |
| 1 | Premier League | Premier League | 8 | England | 2026/2027 | 31 | SUPPORTED |
| 2 | Championship | Championship | 9 | England | 2026/2027 | 59 | SUPPORTED |
| 3 | FA Cup | FA Cup | 24 | England | 2026/2027 | 144 | SUPPORTED |
| 4 | Carabao Cup | Carabao Cup | 27 | England | 2026/2027 | 16 | SUPPORTED |
| 5 | Bundesliga | Bundesliga | 82 | Germany | 2026/2027 | 27 | SUPPORTED |
| 6 | Ligue 1 | Ligue 1 | 301 | France | 2026/2027 | 27 | SUPPORTED |
| 7 | Ligue 2 | Ligue 2 | 304 | France | 2026/2027 | 28 | SUPPORTED |
| 8 | Serie A (Italy) | Serie A | 384 | Italy | 2026/2027 | 32 | SUPPORTED |
| 9 | Serie B (Italy) | Serie B | 387 | Italy | 2026/2027 | 30 | SUPPORTED |
| 10 | Coppa Italia | Coppa Italia | 390 | Italy | 2026/2027 | 8 | SUPPORTED |
| 11 | La Liga | La Liga | 564 | Spain | 2026/2027 | 42 | SUPPORTED |
| 12 | La Liga 2 | La Liga 2 | 567 | Spain | 2026/2027 | 46 | SUPPORTED |
| 13 | Copa del Rey | Copa Del Rey | 570 | Spain | 2026/2027 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |
| 14 | Eredivisie | Eredivisie | 72 | Netherlands | 2026/2027 | 30 | SUPPORTED |
| 15 | Liga Portugal | Liga Portugal | 462 | Portugal | 2026/2027 | 31 | SUPPORTED |
| 16 | Super Lig | Super Lig | 600 | Turkey | 2026/2027 | 29 | SUPPORTED |
| 17 | Liga Profesional de Fútbol | Liga Profesional de Fútbol | 636 | Argentina | 2026 | 50 | SUPPORTED |
| 18 | Brasileirão Série A | Serie A | 648 | Brazil | 2026 | 33 | SUPPORTED |
| 19 | Brasileirão Série B | Serie B | 651 | Brazil | 2026 | 51 | SUPPORTED |
| 20 | Copa do Brasil | Copa do Brasil | 654 | Brazil | 2026 | 4 | SUPPORTED |
| 21 | Paulista A1 | Paulista A1 | 1313 | Brazil | 2027 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |
| 22 | Carioca Serie A | Carioca Serie A | 1296 | Brazil | 2027 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |
| 23 | Copa do Nordeste | Copa do Nordeste | 1294 | Brazil | 2027 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |
| 24 | Copa Libertadores | Copa Libertadores | 1122 | South America | 2026 | 8 | SUPPORTED |
| 25 | Copa Sudamericana | Copa Sudamericana | 1116 | South America | 2026 | 8 | SUPPORTED |
| 26 | Liga MX | Liga MX | 743 | Mexico | 2026/2027 | 36 | SUPPORTED |
| 27 | Major League Soccer | Major League Soccer | 779 | United States | 2026 | 75 | SUPPORTED |
| 28 | CONCACAF Champions Cup | CONCACAF Champions Cup | 1111 | North & Central America | 2027 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |
| 29 | Saudi Pro League | Pro League | 944 | Saudi Arabia | 2026/2027 | 28 | SUPPORTED |
| 30 | Pro League Play-offs | Pro League Play-offs | 1678 | Saudi Arabia | 2018/2019 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |
| 31 | UEFA Champions League | Champions League | 2 | Europe | 2026/2027 | 18 | SUPPORTED |
| 32 | UEFA Europa League | Europa League | 5 | Europe | 2026/2027 | 18 | SUPPORTED |
| 33 | UEFA Conference League | Europa Conference League | 2286 | Europe | 2026/2027 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |
| 34 | UEFA Super Cup | UEFA Super Cup | 1328 | Europe | 2027/2028 | 0 | SUPPORTED_BUT_NO_CURRENT_FIXTURES |

## Liga MX investigation

- Classification: **SUPPORTED**; provider match: Liga MX; provider ID: 743; seasons: 2026/2027.

## MANUAL SPORTMONKS ACTION REQUIRED

- None identified from the live accessible catalog and provider searches.

## Unresolved mappings

- None.

No unsupported competition was treated as available, and no fixture data was fabricated.

## Final persistence verification

Completed: 2026-09-08T07:00:07.171Z

- Neon totals: **34 competitions, 42 seasons, 33 current seasons, 1,343 unique teams, 904 fixtures, 2,484 provider mappings**.
- Exact mapping integrity: **PASS** — 0 competition, season, team, fixture, provider-reference, or internal-mapping duplicate groups.
- Mapping completeness: **PASS** — 0 stored teams or fixtures without a Sportmonks mapping; 0 orphan Sportmonks country mappings.
- Second controlled idempotency pass: **PASS** — 0 new teams and 0 new fixtures.
- Accessible zero-window competitions remain `SUPPORTED_BUT_NO_CURRENT_FIXTURES`; they are not classified as subscription failures.

The coverage fixture count is the provider response count for the controlled discovery window. Canonical database counts can be slightly lower when repeated provider rows normalize to one fixture. Exact final database counts by competition are recorded in `output/m3-6-report.md`.

## Final persistence verification

The controlled ingestion completed after this coverage snapshot. Neon now contains 34 enabled competitions, 42 seasons, 33 current seasons, 1,343 unique teams, 904 fixtures, and 2,484 provider mappings. All duplicate-group checks, missing team/fixture mapping checks, and orphan Sportmonks country-mapping checks returned zero.

The provider fixture counts above are discovery-window evidence. Canonical database fixture counts can be lower where duplicate provider rows normalize to one internal fixture. Exact final per-competition database counts and idempotency evidence are in `output/m3-6-report.md`.
