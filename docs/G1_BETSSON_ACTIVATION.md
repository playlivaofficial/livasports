# G1 Betsson Brazil activation

The approved Betsson BR sportsbook destination is stored in the existing M8 server-side configuration and database. The complete destination and operator campaign reference are private. No destination is compiled into the client or committed to Git.

## Evidence and scope

- Source: authenticated Betsson Group Affiliates Media Gallery, Betsson BR → Sportsbook → Brazilian → Sportsbook Lobby.
- Dedicated campaign: LivaSports Brazil, reference **[masked]**. The account owner confirmed the saved campaign and its number. The generated official tracking value matches that number. The automated Campaigns view did not expose the saved campaign row; the name association therefore includes the owner's explicit confirmation, not an invented portal observation. No additional campaign was created after that confirmation.
- Destination capability: **SPORTSBOOK**. Competition lobby links also appeared in the library. No exact market or prefilled-slip capability was verified. The CTA remains **Ver odds**.
- Exact approved HTTPS tracking host: `record.betsson.bet.br`. Only this BR host was added to the existing exact-host allowlist; there is no wildcard, generic `.com` fallback or MX inheritance.
- The supplied destination is compared byte for byte with the database value. No tracking parameter, order or encoding is rebuilt.
- The portal supplied no operator expiry for this lobby destination. M8's required end date is an explicitly documented **internal 30-day review window**, ending 12 October 2026 UTC. It is not an asserted promotional expiry or additional operator approval.

## Eligible placements

`match_odds_table`, `match_slip_comparison`, `slip_bookmaker_comparison` only. The signed M8 route rechecks the campaign, destination, trusted edge GEO, canonical context and current pregame prices. A slip requires complete current exact coverage. Expired, suspended, started, finished, partial or unavailable pricing cannot activate its CTA.

Betano BR continues to participate in price comparison without a CTA. MX has no BR campaign. Commission does not affect price ordering.

## Operations

The existing `LIVASPORTS_AFFILIATE_CONFIG_FILE` → strict `destinationUrl` configuration → server database path is retained. Private JSON is ignored by Git. The secret scanner additionally checks configured tracking destinations, encoded forms and opaque attribution segments in repository files and fetched HTML/JavaScript.

The protected M8 health endpoint reports `campaignEligibleNow`, placement scope, masked destination presence, analytics and redirect errors. This campaign-level flag does not claim that an individual quote is current. Runtime keys remain server-side. No account credentials, cookies, 2FA data or session tokens were exported.

No payout, banking, security, commission, financial or unrelated affiliate settings were changed. No conversion receiver, sub-ID propagation or prefilled slip transfer is claimed.

Approved creative-delivery limitations are recorded in [G1_SPONSORED_PLACEMENTS.md](G1_SPONSORED_PLACEMENTS.md).
