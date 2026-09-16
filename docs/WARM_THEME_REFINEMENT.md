# Warm premium UI refinement

Baseline: `dcaa919517e7be70834ac7a5fed2f62023c5c4c3`.

## Presentation scope

- Warm off-white, deep green and restrained sand/gold tokens; coordinated dark tokens.
- Accessible, localized one-click theme control. Light is the default; the saved preference is applied before paint and persists across reloads. Blocked storage falls back safely.
- Compact mobile heading/search/competition/date controls and stronger competition bands.
- Two aligned bookmaker groups, 44px odds targets, 68px desktop/tablet fixture rows. Existing finished-match/no-odds layout policy is unchanged.
- Mobile publisher artwork scales proportionally to the available width; desktop artwork is constrained to its container, including at 768px.
- Compact slip selections, clear outcome/price hierarchy, equal comparison cards, estimated-return wording and secondary disclosures.
- Removed public odds age/updated-time labels. Expiry checks, timestamps, stale states, selection gates and quote provenance remain intact.

## Boundaries preserved

No changes to providers, ingestion, scheduler, database, fixture matching, odds truth, proxy rules, arithmetic, GEO, affiliate eligibility, outbound routing, owner authentication or tracking policy. No new dependencies or provider calls.

## Verification

- 867 automated tests: 17 Node tests + 850 Vitest tests; typecheck, lint, production build and secret scan pass.
- BR/EN/MX home pages tested in light and dark at 375, 390, 430, 768, 1024 and 1440px; document horizontal overflow 0.
- Actual rendered search/autocomplete and keyboard navigation, competition drawer, Liga MX fixtures/standings, Flamengo team/player profiles and finished Match Center events/statistics/lineups inspected.
- Real database-backed odds selected into the slip. A 1.42 selection with an informational stake of 25 produced an estimated return of 35.50; real/proxy provenance and estimated disclaimers remained visible.
- Mobile and desktop slip, retained selections after reload, authorized Betsson CTA styling, and unapproved/unavailable bookmaker gating inspected. No operator conversion was executed.
- Local owner sponsor QA used ephemeral server-side QA signing configuration in an ignored loopback-only preview transport. Production owner credentials were not changed. Real approved artwork was used; no fake odds or fixtures were inserted.
- Route, match, profile and slip diagnostic logs reported `providerRequests: 0`; both cache MISS and HIT were observed.

Production deployment identity and post-release evidence are reported in the release response and local `output/warm-theme-release-report.md`. Advertising and outbound actions remain conditional on the existing account/GEO/consent and quote-eligibility policy; a hidden CTA is not activated by this visual change.
