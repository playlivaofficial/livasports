# M7 output contract for future integration

No M8 functionality is implemented.

`POST /api/slip/compare` returns M6's locale, resolvedAt, canonical resolved selections and providerRequests=0, plus `comparison` version 1:

| Field | Meaning |
|---|---|
| locale | BR or MX eligibility context (`br` / `mx`) |
| states | Explicit, potentially overlapping public UX states |
| expiresAt | Earliest currently participating quote deadline, or null |
| bookmakers | Independently eligible bookmaker results |

Per bookmaker:

- `bookmakerId`: stable existing bookmaker key (`betsson` / `betano.bet.br`); clients never supply provider fixture IDs.
- `displayName`, `geoEligibility: {locale, eligible}`.
- `requiredSelectionCount`, `availableSelectionCount`.
- `missingSelections`, `invalidSelections`: canonical selection, public fixture context, state/reason and null noncurrent price.
- `complete`, `selectionQuotes[]`, `combinedDecimalOdds` (exact string; null for incomplete coverage).
- `best`, `tiedBest`: derived from exact price only when at least two complete books exist.
- `affiliateEligibility: {approved, destinationConfigured}`; booleans only, no private tracking values.
- `ctaState`: ENABLED, INCOMPLETE or AFFILIATE_UNAVAILABLE.
- `outboundCapability`: NONE or HOMEPAGE in M7. The type reserves MARKET_DEEPLINK and PREFILLED_SLIP but M7 never emits either.

Each selection quote retains fixturePublicId, exact market/outcome/line/scope, current state, decimalOdds, expiresAt and closesAt. It is current-state evidence, not persisted intent or an operator transfer token. Canonical display order follows the request even when cache identity is sorted.

States include EMPTY_SLIP, ONE_SELECTION, MULTI_SELECTION_NO_BOOKMAKER, ONE_COMPLETE_BOOKMAKER, MULTIPLE_COMPLETE_BOOKMAKERS, PARTIAL_BOOKMAKER_COVERAGE, STALE_SELECTION, MATCH_STARTED, MISSING_SELECTION_PRICE and MIXED_VALIDITY. Overlap is intentional: a slip can have partial coverage and a stale selection simultaneously.

Future consumers must revalidate all selection, jurisdiction, freshness and destination conditions before acting. They must not infer deep-link support from a general destination or infer deposits/revenue from outbound clicks.
