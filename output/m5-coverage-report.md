# LivaSports M5 — Odds coverage report

Generated: 2026-09-12T12:12:16.579Z

Observed feed completeness is separate from executable current prices, GEO eligibility and commercial approval. Expired/suspended/GEO-unverified quotes cannot be best odds.

Database: 34 enabled competitions; 42 seasons; 1343 teams; 904 fixtures; 2595 mappings; 651 current quote records; 1022 meaningful history records.

Provider usage: 15 OddsPapi requests (failed attempts included); 2 narrow Sportmonks diagnostic requests; normal navigation 0.

Latest betano.bet.br response at 2026-09-12T11:56:43.127Z: 39 fixtures; 273 normalized selections. Retained closed historical quote records are excluded from latest-response coverage.
Latest betsson response at 2026-09-12T11:56:47.738Z: 50 fixtures; 350 normalized selections. Retained closed historical quote records are excluded from latest-response coverage.

| Bookmaker | Competition | Market | Complete/sample | Active at observation | Coverage | Result |
|---|---|---|---:|---:|---:|---|
| betano.bet.br | brasileirao-serie-a | MATCH_WINNER | 16/19 | 16 | 84.2% | PARTIAL PASS |
| betano.bet.br | brasileirao-serie-a | TOTAL_GOALS | 16/19 | 16 | 84.2% | PARTIAL PASS |
| betano.bet.br | brasileirao-serie-a | BTTS | 16/19 | 16 | 84.2% | PARTIAL PASS |
| betano.bet.br | copa-libertadores | MATCH_WINNER | 1/4 | 1 | 25% | PARTIAL PASS |
| betano.bet.br | copa-libertadores | TOTAL_GOALS | 1/4 | 1 | 25% | PARTIAL PASS |
| betano.bet.br | copa-libertadores | BTTS | 1/4 | 1 | 25% | PARTIAL PASS |
| betano.bet.br | liga-mx | MATCH_WINNER | 4/7 | 4 | 57.1% | PARTIAL PASS |
| betano.bet.br | liga-mx | TOTAL_GOALS | 4/7 | 4 | 57.1% | PARTIAL PASS |
| betano.bet.br | liga-mx | BTTS | 4/7 | 4 | 57.1% | PARTIAL PASS |
| betano.bet.br | premier-league | MATCH_WINNER | 18/20 | 18 | 90% | PARTIAL PASS |
| betano.bet.br | premier-league | TOTAL_GOALS | 18/20 | 18 | 90% | PARTIAL PASS |
| betano.bet.br | premier-league | BTTS | 18/20 | 18 | 90% | PARTIAL PASS |
| betsson | brasileirao-serie-a | MATCH_WINNER | 19/19 | 13 | 100% | PASS |
| betsson | brasileirao-serie-a | TOTAL_GOALS | 19/19 | 13 | 100% | PASS |
| betsson | brasileirao-serie-a | BTTS | 19/19 | 13 | 100% | PASS |
| betsson | copa-libertadores | MATCH_WINNER | 4/4 | 4 | 100% | PASS |
| betsson | copa-libertadores | TOTAL_GOALS | 4/4 | 4 | 100% | PASS |
| betsson | copa-libertadores | BTTS | 4/4 | 4 | 100% | PASS |
| betsson | liga-mx | MATCH_WINNER | 7/7 | 4 | 100% | PASS |
| betsson | liga-mx | TOTAL_GOALS | 7/7 | 4 | 100% | PASS |
| betsson | liga-mx | BTTS | 7/7 | 4 | 100% | PASS |
| betsson | premier-league | MATCH_WINNER | 20/20 | 6 | 100% | PASS |
| betsson | premier-league | TOTAL_GOALS | 20/20 | 6 | 100% | PASS |
| betsson | premier-league | BTTS | 20/20 | 6 | 100% | PASS |

Missing selections: 77. See the JSON report for every exact canonical fixture/market/outcome. No missing price was replaced with zero.

Timestamps: 0 missing provider timestamps; oldest/newest provider change 2026-09-05T18:16:33.234Z / 2026-09-12T11:56:00.636Z; latest observation 2026-09-12T11:56:47.738Z; 651 observations expired at report time.

## GEO and affiliate boundary

Generic Betsson feed does not verify BR/MX jurisdiction. No eligible MX feed or configured affiliate CTA. No production scheduler is running.

Betano BR can supply BR users with odds for a Mexican competition; that is not evidence of an eligible Mexican bookmaker feed. `/mx` intentionally shows its localized no-coverage state.

## Verified kickoff corrections

50 fixture timestamps corrected from exact Sportmonks evidence; 46 timezone-only, 4 also had a source schedule change. IDs/public URLs preserved. Other 854 fixture timestamps were not shifted.

## Repeat ingestion

- betano.bet.br: current writes 0; history changes 0.
- betsson: current writes 0; history changes 0.

Full timestamps, request paths/sanitized queries, matching and correction evidence are in the JSON companion. No credentials or raw affiliate destinations are included.
