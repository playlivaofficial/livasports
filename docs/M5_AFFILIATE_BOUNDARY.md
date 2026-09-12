# M5 affiliate and measurement boundary

Approval, configured destination, provider feed identity and country eligibility are independent.

- Betsson approval is reported, but no production affiliate URL is configured. The sampled generic .com feed does not prove BR/MX availability.
- Betano BR is comparison-enabled for verified BR feed data but affiliate approval is not active.
- Therefore both current CTAs are absent. No normal homepage link is disguised as an affiliate link.

Existing `bookmakers`, `bookmaker_geo_availability` and `affiliate_links` must all enable the specific country/bookmaker. The destination must be HTTPS, have no embedded credentials/port and match the exact jurisdiction host allowlist. Generic domains, host-suffix tricks, JavaScript URLs and arbitrary query destinations are rejected.

`/go/[bookmaker]` accepts only a canonical fixture UUID, BR/MX locale and one supported market. It resolves its destination server-side, checks fresh eligible pregame odds against the DB and refuses missing/expired/unsupported links. No raw affiliate URL or confidential tracking parameter is passed to the browser. The public link is `rel="sponsored nofollow noopener"`; commission disclosure appears only when an actual eligible CTA exists. The 18+ responsible-gambling notice remains visible.

The existing first-party `product_events` pipeline is extended with `odds_market_view` and `odds_bookmaker_click`; `odds_module_view` records real viewport visibility, not server renders or link prefetch. Context includes canonical fixture/competition, locale, market, bookmaker and placement. UUID event deduplication and a per-fixture rate limit remain. No fingerprint, IP identity or cross-site tracking is added. Optional unavailable events are accepted but not required for page behavior. Tracking failures never block navigation or clicks.

This is a minimal M5 boundary, not a full affiliate/deep-link conversion platform. No M8 scope or invented commercial approvals.
