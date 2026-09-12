# M8 affiliate routing

Every rendered commercial link uses `/go/<bookmaker>/<placement>?offer=<signed-first-party-offer>`. Match Center, the M7 slip and approved sponsor creatives share this boundary. Old Match Center and slip URLs revalidate through the same policy but cannot contribute attributable human clicks without signed render context.

Eligibility requires an enabled bookmaker, independently verified country, affiliate approval, enabled approved destination and campaign, allowed placement, active dates, matching trusted Vercel GEO, and exactly one eligible campaign. Match odds also require a current pregame quote; M7 requires complete exact coverage from one bookmaker. Every click rereads eligibility and prices, bypassing the comparison cache. Ranking and arithmetic never consult commission.

Only jurisdiction-specific HTTPS Betsson and Betano domains coded in `src/odds/affiliate.ts`, intersected with the campaign domain allowlist, are accepted. URLs with credentials, unexpected ports, control characters, whitespace or backslashes fail. Unknown/duplicate query keys, client destination/campaign overrides and altered signed context fail. Approved query parameter order, duplicates and encoded values are preserved; no sub-ID parameter is appended.

The offer contains a random view UUID, internal campaign UUID, bounded canonical context and expiry. HMAC SHA-256 protects it with the server-only `AFFILIATE_SIGNING_SECRET`. Maximum lifetime is five minutes and is shortened by campaign/creative/quote expiry. The client also withdraws expired offers using server time and elapsed time. Long-lived active CTA offers renew once near expiry while the tab is visible; a short-lived quote does not create a polling loop. Sponsor offers expire with their rendered page and refresh on navigation.

The browser sees an internal URL, never the tracked operator destination or operator campaign identifier. After a verified activation, HTTP 303 redirects with private/no-store, noindex/nofollow and no-referrer headers. A slip rejection returns to the localized saved slip with an explanation. HEAD/prefetch/bots do not activate the commercial destination. Unknown direct requests may navigate safely but are not human click measurements.

Destination/configuration failures fail closed. Analytics is scheduled with Next `after`, so a failed or slow write cannot delay a verified redirect. Commercial DB reads/writes use a separate pool (three connections; bounded connection/query timeouts). No OddsPapi or Sportmonks requests occur in this path.

`ISSUED_303` proves LivaSports issued the configured destination. Operator arrival cannot be observed and is never reported as confirmed arrival.
