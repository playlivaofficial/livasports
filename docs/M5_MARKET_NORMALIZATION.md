# M5 market normalization

Only football, full-time regulation (90 minutes plus stoppage), pregame prices are comparable. Extra time, qualification and special settlement variants never map into these markets.

| Provider market | Canonical | Outcomes | Line |
|---|---|---|---|
| 101, Full Time Result, fulltime / 1x2 | MATCH_WINNER | 101 → HOME, 102 → DRAW, 103 → AWAY | NULL |
| 1010, Over Under Full Time, fulltime / totals | TOTAL_GOALS | 1010 → OVER, 1011 → UNDER | 2.5 |
| 104, Both Teams To Score, fulltime / bothteamsscore | BTTS | 104 → YES, 105 → NO | NULL |

Catalogue validation checks the complete name, ID, sport, handicap, period, playerProp flag and outcome identities. IDs alone are insufficient if metadata changes. Live data confirmed BTTS type `bothteamsscore`, rather than a misleading generic totals example.

The adapter rejects invalid/non-finite prices, decimals ≤1 or >1000, unknown outcomes, multiple/named player entries, basketball, halves, corners, cards, double chance, draw-no-bet, 2-up and qualification markets. Only explicitly audited total 2.5 is accepted, including when it is not the bookmaker's main line.

Decimal precision is preserved as a decimal string and unconstrained PostgreSQL numeric. UI presentation rounds to two places; comparison uses the original value. Missing does not mean zero. A best-price highlight needs at least two current, eligible bookmakers for the exact same outcome/line/scope. Ties are highlighted equally. One bookmaker never receives a best badge.

Provider suspension/inactive market/inactive outcome → SUSPENDED. Actual start, non-pregame provider state, canonical non-scheduled state or reached kickoff → CLOSED. Missing/future quote timestamps or expired observation → STALE. These states cannot create an actionable comparison or affiliate destination.
