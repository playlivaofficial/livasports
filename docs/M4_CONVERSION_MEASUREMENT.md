# LivaSports M4 — Conversion Measurement

## Events implemented

| Event | Trigger | Current state |
|---|---|---|
| `match_open` | Match page rendered in the browser | OPERATIONAL |
| `match_tab_view` | User selects a Match Center section | OPERATIONAL |
| `odds_module_view` | Odds module enters the viewport | OPERATIONAL |
| `match_share` | User uses the share action | OPERATIONAL |
| `affiliate_outbound_click` | Eligible partner link click | SCHEMA READY; no eligible link is currently rendered |

Events use browser-generated UUIDs, a 10-second session deduplication key, a measured 2 KB request limit, same-origin enforcement, an allow-listed event name and locale, a per-fixture write ceiling, and a database check that fixture and competition IDs match. Analytics failure never blocks match content.

## Commercial boundary

- The user reports affiliate approval with Betsson. That does not by itself verify every permitted GEO, operator domain, tracking parameter, or destination URL.
- Betano BR is not presented with an affiliate CTA until its commercial state is explicitly enabled.
- Odds can be displayed only when bookmaker/GEO odds availability has a verification timestamp.
- An outbound link additionally requires active bookmaker affiliate status, enabled bookmaker/GEO affiliate state, and an enabled destination link.
- The UI includes an 18+ / responsible-gambling notice and commission disclosure.
- Bookmaker ordering is never changed by commission state.

M4 does not make a claim that a bookmaker is licensed for a user solely because a provider returned a name. Operator/legal verification remains an explicit launch check against the relevant official Brazilian or Mexican authority and current partner terms.

## Measurement still required before conversion claims

- Install verified Betsson destination and tracking parameters for each approved GEO.
- Validate redirect chains and attribution with the affiliate program.
- Define consent, retention, access, and deletion policy for product events.
- Compare internal outbound events with partner-reported conversions.
- Add postback ingestion only after partner documentation and authentication are approved.

Until those checks are complete, M4 reports interaction events—not deposits, revenue, or attributed conversions.
