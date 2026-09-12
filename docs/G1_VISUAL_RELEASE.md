# G1 sports visual release

The Brazil-first refresh improves the fixture list, competition navigation, Match Center, team profiles, player profiles, and shared typography, spacing, surfaces and keyboard focus. The score hero shows the localized kickoff for scheduled matches and preserves real results for finished matches. Existing team crests and player portraits use appropriately sized image requests.

Desktop uses a clear competition rail and compact fixture rows. Tablet and mobile retain horizontal competition navigation within the page width, with a separate mobile navigation row. Long team/player names wrap. Missing sports information remains explicit. The existing BR/MX routes, 34-competition registry, source data and M3–M8 behavior remain intact.

Section navigation accounts for sticky headers, native anchor offsets, resizing and the maximum scroll position on short pages. Focus outlines remain visible even where earlier component rules reset them. Reduced motion remains supported.

## Scope and isolation

This release starts at main `8c35273729a62923900251d6712e6fb5b4d3955b`. It does not include the separate preserved commercial commit `e8319b934f7de19db4306b9f785fe75aee530703`.

Affiliate implementation, outbound routes, API handlers, commercial components, database migrations, odds logic, slip components, package versions and deployment configuration match that baseline. Existing slot declarations remain in place. There is no publisher-creative route in the source or build, and no new publisher asset in public JavaScript.

The original commercial work and private configuration remain available separately. See [COMMERCIAL HANDOFF](G1_COMMERCIAL_HANDOFF.md). Commercial activation is not complete.

## Verification before release

- 8 Node tests and 366 Vitest tests passed.
- Full lint, explicit typecheck and the standard Next.js/Turbopack production build passed.
- 235 sports layout and accessibility checks passed across nine page cases at 375, 390, 430, 768 and 1440px.
- The matrix includes BR/MX home, scheduled/finished Match Centers, regular/long-name teams, and populated/partial players.
- No measured horizontal overflow, broken images, browser runtime errors, operator ad requests or browser provider requests; measured page CLS was zero.
- Existing route, canonical redirect, sitemap, BR/MX and 34-competition regressions passed. All 50 stored source-confirmed kickoff corrections remain exact.
- Existing negative HTTP safety checks passed without creating affiliate events or provider requests.
- The source/build isolation audit passed.
- Repository and rendered public-page/script secret scans passed. The scanner now inspects the indexed copy of an unstaged deleted file; two dedicated regression tests cover that behavior.

The measured BR home asset delta from deployed M8 is −275 bytes of gzip JavaScript and +3,463 bytes of gzip CSS. No runtime dependency or external advertising asset is added. These are asset-size measurements, not a claim of production Core Web Vitals.

Intensive local navigation produced Next.js “destination stream closed early” entries when pending page streams were canceled. Browser checks recorded no page failures or runtime exceptions. Production logs are reviewed separately after deployment.

Only this visual release is authorized for main and the existing LivaSports Vercel project. Final deployed SHA, production QA and the stop-state are recorded in the separate final release report.

