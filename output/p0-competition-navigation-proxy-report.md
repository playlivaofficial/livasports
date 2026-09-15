# LivaSports P0 — Competition Navigation, Flags, Fixtures Hub and Estimated Comparison

## Scope completed

- All 34 enabled competitions resolve to a dedicated competition hub in PT-BR, EN and ES-MX.
- Fixtures is the first and default competition tab; Results, Standings, Top Scorers and Teams preserve competition, locale and season.
- Missing or invalid season parameters fall back safely to a valid current or populated season.
- A requested season whose six tracked capabilities are verified empty also falls back to the first populated season, while preserving the fallback explanation.
- Competition navigation is driven by enabled database competitions and remains available when the active fixture window is empty.
- Navigation groups every domestic league by its individual country, orders those country sections deterministically, then lists international competitions under neutral regional sections.
- Domestic competitions use real country flag assets; international competitions use a neutral confederation/region mark.
- Player nationality marks come from player metadata, never from the player's club.
- Neutral home routes default to Upcoming; explicit Live and Results filters remain available.
- Finished and live-only fixture groups remove the pregame-odds heading and unused odds column.
- Browser-detected time zones drive dates and kickoffs in all three interface locales; a saved manual selection still overrides the device setting.
- Exact missing bookmaker selections can use a current exact quote from the other supported bookmaker as a display-only proxy.
- Proxy prices remain confined to the comparison read model and are never written to `odds_current`.
- Every bookmaker comparison card displays the required localized estimated-comparison disclaimer.

## Verification evidence

- Full automated tests: **845 passed, 0 failed** (17 Node tests and 828 Vitest tests).
- TypeScript: **PASS**.
- ESLint: **PASS** with zero warnings.
- Production build: **PASS**.
- Secret scan: **PASS** with zero credential leaks and zero client secret references.
- Local competition route matrix: **1,632 requests passed, 0 route crashes** across 34 competitions, 3 locales, all 5 tabs, invalid seasons, current seasons and historical seasons.
- P0 browser QA: **76 checks passed** across four device time zones and 12 responsive captures.
- Locale/responsive browser QA: **957 checks passed** across 21 routes at 375, 390, 430, 768, 1024 and 1440 CSS pixels; no horizontal overflow observed.
- Keyboard/accessibility browser QA: **213 checks passed** across PT-BR, ES-MX and EN match routes.
- Ordinary navigation provider requests: **0**.
- Proxy comparison browser QA: **PASS** for all-real, Betano-proxy and Betsson-proxy combined slips, including per-leg labels and localized estimated-comparison disclosure.
- Production-regression coverage now treats every unusable target state as eligible for an exact current quote from the other bookmaker. The persisted Botafogo–Grêmio Draw case resolves Betano 3.70 as REAL and the suspended Betsson leg as a disclosed PROXY, with complete estimated coverage.
- Live-data hardening QA: **30/30 slips produced both totals**, including a five-leg slip with mixed REAL/PROXY legs on both cards; unexplained states **0**, provider requests **0**.

## Data safety

- No ingestion was run.
- No production database writes were made.
- No provider calls were made during navigation QA.
- Existing provider adapters, scheduled ingestion and canonical provider attribution are preserved.

## Release

Production deployment and post-deployment verification are recorded in the final task response and Vercel deployment metadata.
