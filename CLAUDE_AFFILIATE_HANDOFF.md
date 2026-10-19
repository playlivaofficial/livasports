# LivaSports 2.0 — affiliate activation handoff

## Release boundary

V2 deliberately ships **zero active affiliate destinations**. Do not interpret a logo, the MX/CO/PE inventory, a historical campaign, or an Owner preview as commercial approval. All V2 slots are `pending_verification`, with `affiliateEnabled: false`, no campaign, no offer, no verified date and no destination. Brazil and unknown/other GEOs remain commercially closed. Public football content and tools remain globally accessible.

## File map and contract

- `src/v2/CommercialSection.tsx`: `OperatorLogoSlot`, `OperatorComparisonCard`, `AffiliateCtaSlot`, `OfferTermsBlock`, `GeoCommercialSection`. These provide responsive local logos, offer/terms slots, disabled CTA presentation and neutral review links. Use these components rather than redesigning cards.
- `src/v2/commercial.ts`: `CommercialSlot` contract and `pendingOperatorSlots`. Identity assets/order come from the existing `VISIBLE_BOOKMAKERS` registry in `src/odds/registry.ts`; **not** proof of approved campaigns. Fields: operatorId, countryCode, operatorName, logoAsset, reviewPath, campaignId, offerTitle, offerTerms, trackingDestination, affiliateEnabled, commercialStatus, placementId, displayPriority, lastVerifiedAt, paymentMethods.
- `src/v2/pages.tsx`, `review-sections.ts`: directory, article/sidebar-ready commercial section, neutral review frameworks. Pending reviews are noindex and excluded from the sitemap. Do not fabricate ratings, reviews, payment support, licensing or bonuses.
- `src/localization/PublicPresentation.tsx`, `src/odds/commercial-geo.ts`, `src/config/geo.ts`: existing private trusted-GEO presentation and server authorization boundary. Routes, language, editorial edition selector, query parameters and public cookies are **not** eligibility evidence.
- `src/owner/session.ts`, `server.ts`, `PreviewControls.tsx`, `/owner/preview`: separate permanent-key hash authentication and signed 30-day Owner session. Preserve these unchanged. Select MX, CO or PE after login; `QA_TEST` stays visible. Reset to Real GEO afterward. Never expose key/hash/session secret.

## Preserved historical storage — do not overwrite blindly

`src/affiliate/repository.ts`, `configuration.ts`, `policy.ts`, `service.ts`, `server.ts`, `types.ts` retain the previous verified campaign/tracking implementation. Existing PostgreSQL relationships remain:

`bookmakers` + `countries` → `bookmaker_geo_availability` → `affiliate_links` → `affiliate_campaigns`; creatives in `profile_sponsor_campaigns`, activation audit in `operator_activation_audit`, existing click/attribution/postback history retained.

No schema migration, campaign copy, data reset, destination export or credential rotation is part of V2. The old campaign resolver also depends on odds/provider verification and old live-page placement identities. **Do not import it wholesale into V2 and accidentally reactivate sports IO.** Reconcile its legal/affiliate approval, date/domain allowlists, version revocation and audited redirect protections with the new editorial context in a separately tested activation change. Remove only obsolete sports-data prerequisites, not commercial safeguards.

## What Claude must implement before activation

1. Obtain explicit, current approval for each country/operator/campaign, destination, offer terms, assets, dates and placement. Read only the necessary private campaign data server-side; never copy destinations/tokens into source or public props.
2. Add a bounded server-side campaign resolver using the existing storage and trusted GEO. Keep static page shells shared; private commercial reads must be `private, no-store` and must never leak one GEO/Owner response to another.
3. Map verified public offer fields into `CommercialSlot`. Keep raw tracking destination server-only; expose a signed first-party `/go` action instead. `AffiliateCtaSlot` currently intentionally has no active-link branch: introduce a separately authorized active branch only after resolver and redirect tests pass.
4. Restore the relevant `/go/[bookmaker]` and placement execution paths through the existing signed, campaign-version-checked, approved-domain, country-checked tracking pipeline. V2 currently returns terminal 410 from these legacy routes, including `/go/slip`; do not restore slip/live-odds behavior. Missing/expired/revoked campaigns must fail closed, never fall back to another country or operator homepage.
5. Extend explicit allowed placement/page identities for V2 home, directory, review and editorial context. Do not invent fake fixture identities. Separate informational review navigation from paid outbound visits.
6. Reuse bounded first-party instrumentation in `src/analytics` and existing affiliate ledger. Event context must carry operator, placement, trusted GEO, page, device category and campaign status. Emit eligible verified impressions only, deduplicate per placement/session, respect DNT/GPC and OWNER/QA/BOT exclusions. Disabled placeholders emit **no referral or conversion events**. Do not claim registration, FTD or revenue without partner-confirmed reporting.
7. Verify the actual partner destination and tracking at the approved test level. Do not perform a deposit or place a bet. Preserve existing postback authentication/idempotency and historical records.
8. Test MX Betsson/Winpot, CO Betsson/bwin, PE Inkabet/1xBet independently; BR, US, GE, ES, PT, unknown remain closed. Change language and editorial edition without changing trusted GEO. Test forged public headers/cookies/query parameters, expired Owner cookies, preview reset, stale signed grants, campaign revocation and cache isolation.
9. Run full tests, typecheck, lint, build, SEO crawl, secret scan, mobile/light/dark QA, required CI and a controlled production check through the normal PR flow. Do not resume any sports cron, provider refresh or media-generation job.

## Activation status

| GEO | Operator identities | Current state |
| --- | --- | --- |
| MX | `betsson`, `winpot.mx` | Both inactive; destinations/offers await verification |
| CO | `betsson`, `bwin` | Both inactive; destinations/offers await verification |
| PE | `inkabet`, `1xbet` | Both inactive; destinations/offers await verification |
| BR / ROW / unknown | None | Commercially closed |

The pending UI is ready. **Campaign approval, resolver adaptation, tracked redirect activation and end-to-end attribution validation remain Claude's next task.** No secret values belong in this document.
