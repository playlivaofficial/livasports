# M7 bookmaker eligibility

| Bookmaker / GEO | Public odds | Affiliate approval | Outbound |
|---|---|---|---|
| Betsson BR | Confirmed by owner; valid exact current quotes required | Confirmed, ACTIVE | Configuration-gated; approved destination not yet available in this local environment |
| Betano BR | Confirmed BR feed; valid exact current quotes required | Not confirmed | Disabled without real approval and destination |
| Betsson MX | Separately gated; no BR inheritance | Does not prove MX eligibility | Requires independent MX verification/configuration |
| Betano BR in MX | Ineligible | Irrelevant | Disabled |

This owner-confirmed M7 evidence supersedes older M5/M6 reports describing Betsson BR as generic/unverified. The older reports remain historical evidence. An approved BR verification can accept OddsPapi's `betsson.com` feed identity; it need not be renamed to `betsson.bet.br`. This does not admit arbitrary domains or prove Mexico eligibility.

Pricing gates, affiliate approval and configured destination are independent. Migration 011 records Betsson BR confirmation without creating any URL. Existing enabled/current quote and fixture mapping safeguards remain authoritative. Betano's affiliate status never reduces its odds visibility or ranking.

## Secure destination boundary

Destinations remain in the existing server-only `affiliate_links` configuration. Existing enabled, approved-at, campaign-verified, `match-odds` placement and country affiliate gates apply. Only HTTPS, allowlisted jurisdiction hosts without embedded credentials or ports are accepted. M7 uses the existing approved general destination; no tracking URL appears in public JavaScript, comparison JSON or local persistence.

`GET /go/slip/[bookmaker]` accepts only locale and the bounded canonical selection payload. Extra/duplicate arguments, arbitrary destination parameters, malformed selections and unsupported bookmakers are rejected. Every click bypasses the comparison cache and re-reads all exact selections and commercial eligibility. Only a complete, current, pregame, eligible slip with a valid destination redirects. A failed check returns to the localized saved slip with an explanatory notice. Analytics failures cannot block the link.

The CTA is “Ver odds” / “Ver cuotas” and uses sponsored/nofollow/noopener/noreferrer. Copy says that it opens the bookmaker site and that users must verify their selections/odds there. No prefilled-slip capability is claimed. Outbound capability is HOMEPAGE only when the existing destination is approved/configured, otherwise NONE. Casino/sponsor placements remain separate.
