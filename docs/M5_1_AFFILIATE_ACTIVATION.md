# M5.1 — Approved affiliate boundary

`AFFILIATE_DESTINATION_CONFIGURED=NO`. All current ignored environment files, Vercel environment names and Neon link configuration were inspected. There is no actual approved Betsson destination/campaign URL to wire. No URL was invented. Betsson partnership approval is stored ACTIVE; Betano remains NOT_APPLIED. Neither has an active CTA.

## Activation requirements

An operator must securely provide the actual approved HTTPS destination, intended BR/MX country, correct approved campaign/tracking, operator-domain approval and partner approval. The existing `affiliate_links` row must additionally have `approved_at`, `campaign_verified=true`, and `approved_placement='match-odds'`. Country-specific bookmaker affiliate eligibility must be explicitly enabled only after pricing GEO verification. Values belong in the server-side store, never a report, public JS or source file. No generic homepage is a substitute for an approved tracking link.

The current secure redirect is `/go/[bookmaker]` with allowlisted `fixtureId`, `locale`, `market`, and required `placement=match-odds`. Only Betano BR and Betsson are accepted. Duplicate/extra parameters, arbitrary destinations, unapproved placement, credentials in URLs, HTTP and off-domain destinations are denied. Exact approved tracking parameters are preserved server-side; public pages contain only internal `/go/` links. Existing stale legacy links without placement fail safely.

On every click the server re-reads the canonical fixture and current odds from Neon, outside the page cache. Action requires all of: current valid quote, correct verified GEO/source, partner approval, approved configured destination/campaign/placement, pregame state, and non-suspended/non-closed/non-expired price. No provider request is made on click. A failed analytics request, unavailable storage or UUID generator cannot break normal link navigation.

UI copy is “Ver odds” (PT-BR) / “Ver cuotas” (ES-MX), with `rel="sponsored nofollow noopener"`. The commission disclosure appears only if a genuine eligible action exists. Responsible-gambling/18+ context remains. M5 sorting/best-price logic does not depend on commission.

Actual active-CTA visual testing and two-public-bookmaker comparison are **NO SAMPLE**, not fabricated PASS, because the required real evidence/configuration is absent. Unit tests cover the guarded eligible case, stale/kickoff withdrawal, approved placement, domain checks and sponsored markup. This is not M8 attribution.
