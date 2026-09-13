# G1 commercial and release QA

## Completed local evidence

- Full suites: 6 Node tests and 367 Vitest tests passed; lint, typecheck and production build passed before the final operations-health addition.
- 16 transactional M8 database checks passed. Synthetic records and transaction-only freshness replay were rolled back. Exact destination preservation, bounded queries, idempotent analytics, privacy, QA isolation, retention and deferred attribution were covered.
- 11 checks of the real saved private G1 configuration passed: approved BR campaign, exact destination, three permitted placements, sportsbook capability, no banners, MX/Betano isolation and masked operations.
- 114 local browser regression checks passed for current, partial, stale, suspended, started, tied, long and missing comparisons; keyboard add/replace/remove, ten-pick limit, persistence, two-tab synchronization and four 61-second no-polling observations.
- 14 visibility/privacy checks passed, including hidden/background impressions, one visible impression, deduplication, QA classification, DNT, sponsored link attributes and 44px targets.
- 25 HTTP commercial security checks passed: invalid/duplicate input, schemes/overrides, unknown placements, forged tokens/events, cross-origin requests, prefetch/HEAD/bots, disabled postbacks, authenticated operations and BR/MX banner isolation.
- Full BR/MX routes, 34/34 registry navigation, canonical redirects, profiles, Match Center, sitemap and 50 source-confirmed kickoff corrections passed. Normal navigation provider-call delta remained zero.

Replay data is labeled local simulation and never substitutes for public odds. No synthetic campaign, price or conversion was published. The no-banner state is the intentional permitted fallback, not a claim that live creatives were tested.

## Performance

Measured home-page asset totals against the preserved M8 production baseline: G1 JavaScript 630,326 decoded bytes versus 630,879 (−553); CSS 90,079 versus 68,811 (+21,268). Reproducible gzip totals: JavaScript −267 bytes, CSS +4,194 bytes. No new runtime dependencies or banner bytes. These are measured build/resource samples, not network speed guarantees.

Initial page captures had CLS 0; the continuous slip/viewport-transition sample was approximately 0.0294. The stylesheet preserves reduced-motion behavior, dimensions and readable contrast. Final browser and production checks are recorded in `output/g1-report.md`.

## Commercial measurement boundaries

M8 records opaque signed-offer activation and separates QA from human traffic. A verified 303 proves an issued redirect; it does not prove operator arrival, registration, deposit, commission or conversion. No unsupported downstream receiver or sub-ID mechanism was activated. Betano price ranking remains independent of affiliation.

The approved sportsbook campaign has an internal review deadline, documented in the activation guide. Continuous odds automation remains a separate pre-existing non-operational Hobby limitation; a successful commercial configuration does not make stale quotes current.

The final release gate includes a scan of repository and served HTML/JavaScript for the actual private destination, encoded forms, opaque attribution segments and existing provider/database/runtime secrets. Reports and screenshots never contain the raw portal tracking destination.
