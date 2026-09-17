# Hotfix — header My Matches contrast, mobile fixture favorite placement, sponsor creative sizing

Released 2026-09-17 on `main` `0aea4fd` (branch `hotfix/mobile-favorites-banner-sharpness`; code commits `a645158`, `53580f9`). No database, provider, odds, favorites, auth, GEO or SEO behaviour changed.

## Root causes (reproduced on production before the change)

| Defect | Owning rule | Measured before |
|---|---|---|
| Header My Matches star invisible in light mode | `src/app/sports-product.css`: `html[data-theme=light] .my-matches-header-link { color:#17323a }` while the header background is `--header-bg` (#102b25 light / #101f20 dark) in both themes | glyph `rgb(23,50,58)` on `rgb(16,43,37)` ≈ 1.2:1 |
| Mobile fixture star over the BETANO label | `.sports-board .favorite-toggle-row { position:absolute; left:0; top:50% }` inside a ≤767px fixture that stacks the odds on a second row | 8/8 rows at 390px: star box (10,509,44×44) intersected `Betano` label and the first `1` odds cell; 0px horizontal overflow |
| Mobile sponsor artwork soft | `warm-themes.css`/`premium-redesign.css` forced `.sponsor-embed-box` to `width:100% !important` and `SponsoredCreative.tsx` applied `transform: scale(slotWidth/creativeWidth)` | approved mobile creative is the official Bannerflow **320×100** embed (desktop top: **970×90**); on 390–430px phones the 320px creative was enlarged 1.22–1.34× on top of DPR 2–3 upsampling; desktop renders 970×90 at scale ≈1 |
| (found by QA) desktop star hit-box touched the kickoff text | `padding-left:42px` gutter vs a 44px button | 2px intersection at 768/1024/1440 in every row (glyph clear) |
| (found by QA) 320px header: wordmark overflowed under the actions | brand column collapsed to 43px, text `overflow:visible` | wordmark drawn under the star button |

## Fixes

* Header: header-scoped `--header-fg` / `--header-fg-muted` tokens on `.app-header`; the link, its star glyph and its text use them in default, hover, focus-visible, active and visited states; the light-theme override was removed. Measured after: glyph 14.19:1, desktop text 12.17:1 in both themes.
* Mobile fixtures (≤767px): `grid-template-columns: minmax(0,1fr) 44px` with the favorite in its own trailing cell of the match-information row (`position:static`), the odds slot spanning row 2 at full width. Desktop keeps the left-gutter star (gutter 46px).
* Creatives: `creativeFit()` caps the embed transform at scale 1 and centres it; mobile inline slot CSS no longer forces the embed box/image to 100% (the full-bleed slot and anchor remain 100%). Space is still reserved by the box's `aspect-ratio`; the banner is 100px tall instead of 122–134px, so nothing moves down.
* 320px: only the brand mark is shown (link keeps `aria-label`).

## Evidence

* Guards: `src/app/mobile-favorites.css.test.ts` (6 tests); `scripts/hotfix-mobile-layout-qa.mjs` + `scripts/hotfix-layout-probe.mjs` (headless Chromium geometry: header contrast, favorite↔label/odds/team/kickoff/score collisions, label↔group attachment, overflow, creative scale, favorite/odds interaction isolation, provider requests).
* Production run on `0aea4fd`: **213/213 PASS** — widths 320/360/375/390/430/768/1024/1440 × light/dark × pt-BR/en/es-MX; 0 collisions over 1,620 star measurements per width; 306 bookmaker labels attached everywhere; min odds cell 44px at 320; 0 overflow; favorite tap → favorite only; odd tap → slip only; 0 sports-provider requests (network-level). Results view (finished rows, no odds columns) 27/27 rows clear; slip drawer open/closed does not move stars; last row scrolls above the sticky bar. Screenshots: `output/hotfix-screens/{br,en,mx}-{light,dark}-{320…1440}.png` (ignored, 48 files).
* Browsers: headless Chromium (CDP) and the desktop-app Chromium pane. WebKit/real iPhone: **NOT RUN** (no WebKit runtime or device available here).
* Banner in an eligible context: **NOT RUN / USER VALIDATION REQUIRED** — public GEO is ineligible from this location and owner preview was not used. Rendering fix verified by unit tests only. **Asset limitation:** the only approved mobile creatives are 320×50 and 320×100. Edge-to-edge sharpness on a 390–430px DPR-3 phone needs an approved creative ≈1,170–1,290 source pixels wide (e.g. 1290×403 for the 320×100 ratio, or an @2x/@3x export of the same artwork); until then the creative is shown at its native 320px, centred, never enlarged.
