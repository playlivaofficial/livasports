# LivaSports M3.5 Visual System

## Direction

LivaSports uses a compact, sports-first dark interface. The product is designed as a fast information utility: fixtures and scores lead, navigation stays shallow, and decoration never competes with match data. The visual language avoids casino motifs, oversized SaaS cards, heavy gradients, and fake product controls.

## Tokens

The shared tokens live in `src/app/globals.css`.

- Background: deep navy `#071019`, with `#040a10` for the deepest layer.
- Surfaces: `#0c1722` and `#111e2b`; hover elevation uses `#152434`.
- Text: near-white primary, blue-gray secondary, muted slate metadata.
- Accent: vivid teal `#24d39b`, reserved for active navigation, positive state, and brand details.
- Status: restrained red for live, amber for warnings, muted slate for finished/cancelled states.
- Spacing: a 4px-based scale from `--space-1` through `--space-8`.
- Radius: compact 6px, 10px, and 14px levels.
- Container: maximum `86rem`; the desktop context rail is intentionally narrow.
- Motion: a 140ms fast transition, disabled when reduced motion is requested.

## Typography

The UI uses a system-first sans-serif stack for fast rendering and native Portuguese/Spanish coverage. Scores, kickoff times, and odds use a numeric monospace stack with tabular figures. Headlines remain compact; team names and final scores are the strongest fixture-row content.

## Shared shell

`SiteHeader` provides the LivaSports identity, Home, Football, Live, Today's Games, and the BR/MX locale switch. It is sticky, compact, and route-aware. Mobile uses a two-row grid so the brand, locale switch, and full primary navigation fit at 375–430px without a fake menu.

`PageHeader` holds localized country/date context, the utility title, a short description, and a deliberately subordinate freshness label.

## Fixture system

- `CompetitionTabs` and `FixtureSummary` provide compact context and real in-page competition navigation.
- `FixtureList` groups matches by competition and uses a dense table-like layout on desktop.
- `FixtureCard` supports scheduled, live, halftime, finished, postponed, cancelled, and abandoned states.
- Kickoff time/date is compact and scan-friendly.
- Team names are primary; valid existing Sportmonks images are displayed through `TeamMark`.
- `TeamMark` accepts only HTTPS images from `cdn.sportmonks.com` and falls back to initials on an invalid or failed image.
- Finished scores are visually stronger; scheduled placeholders are muted.
- Sparse odds use only a small `—` slot with a compact localized accessible label. No bookmaker/provider explanation is repeated per match.

## Responsive strategy

- Desktop uses a narrow context rail plus a flexible fixture column; no empty future-feature panel is rendered.
- Below 900px, context information moves above the fixture list.
- At 620px and below, the header becomes a two-row grid, summary data uses three equal columns, fixture rows collapse to time/teams/score, and the empty odds column is hidden.
- Empty states remain contained cards at mobile widths; they never use negative viewport margins.
- The layout has been measured at 375, 390, and 430px with document and body scroll widths equal to the viewport.

## Localization

All customer-visible BR routes use pt-BR and São Paulo time. MX routes use es-MX and Mexico City time. Empty, loading, status, navigation, freshness, and unavailable-odds labels are localized. Mexico's missing fixture coverage is presented as an intentional product state without provider names or fabricated matches.

## Accessibility

- A skip link targets the fixture content.
- Navigation uses real links and exposes the active page.
- Visible `:focus-visible` treatment is shared across interactive elements.
- Status meaning includes text and is not color-only.
- Team images are decorative beside visible team names and safely fall back without broken-image UI.
- Contrast remains high on every dark surface.
- Reduced-motion preferences disable nonessential transitions and smooth scrolling.

## Performance constraints

M3's route loaders, L1/L2 cache, deduplication, stale fallback, and database-first delivery are unchanged. No provider call is made for navigation or logos. Logo URLs come from the existing joined fixture query; the query gained fields, not another round trip. `TeamMark` is the only small client island added and no dependency or animation library was introduced.

## Future compatibility

The fixture row reserves a restrained odds slot for later bookmaker comparison, while the desktop layout can accept a real slip only when that feature exists. The component and token system can support M3.6 competition expansion and later Match Center, bet-slip, and comparison milestones without fake controls or a shell redesign.
