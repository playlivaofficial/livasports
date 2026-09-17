# P2 — Release evidence (2026-09-17)

Branch `claude/p2-seo-growth-engine` → `main`. Production deployments verified on the apex through the Vercel alias lookup (`scripts/p2-deployment-status.mjs`) and `/api/internal/health` `release.commit`:

| main commit | Vercel deployment | apex match | what |
|---|---|---|---|
| `f99b812` | `dpl_DwoWJsw7WrF6Ykh1zQAjt3GRzzux` | yes | P2 feature (squash) |
| `47f4077` | `dpl_2pFad1EpD5punpxevJRp3V6FGhkE` | yes | og:image on every page, proxy 404 for unknown competitions, sitemap counts cache, migration 024 |
| `da10650` | `dpl_6LcwZueJF4cGWcRBFj7mEfJ3jDef` | yes | BreadcrumbList on English profiles |
| `38f782a` | `dpl_8e5ry2NqTvZ5ZALvNNJEcGUBhJeU` | yes | noindex profiles without hreflang cluster — **final verified release** |

No secrets rotated, no project/DNS/account changes, no force pushes, no history rewrites. Local `.claude/launch.json` is not committed.

## Gates on the final candidate (LOCAL TESTED)

```bash
corepack pnpm test            # node --test 17/17 + vitest 119 files / 949 tests — PASS
corepack pnpm typecheck       # PASS
corepack pnpm lint            # PASS (max-warnings=0)
corepack pnpm build           # PASS (Next 16.3.4, /icon.svg, /opengraph-image.png, /robots.txt static; sitemaps dynamic)
corepack pnpm secret:scan     # PASS (0 leaks, 0 tracked env files)
```

Baseline before P2: 117 files / 893 tests. P2 added `src/seo/policy.test.ts` (15), `src/sports/metadata.test.ts` (10 incl. 34-competition table), `src/localization/seo.test.ts` (+1) and updated three obsolete assertions (see `docs/P2_SEO_FINDINGS.md`).

**NOT RUN locally (environment blocker, not product behaviour):** `qa:sports:db`, `qa:sports:profiles`, `qa:p0:routes`, browser QA and a locally served built app. This session had no `.env.local`, and the auto-mode classifier declined both materialising the production `DATABASE_URL` and starting a local server. Vercel preview deployments are SSO-protected (302 → `vercel.com/sso-api`, `X-Robots-Tag: noindex`) so they could not substitute. Data-backed validation therefore ran against production after each deploy (below).

## Production SEO QA (PRODUCTION TESTED)

```bash
node --require ./scripts/tsx-windows-preload.cjs --import tsx scripts/p2-seo-http-qa.ts https://livasports.com --budget=240
node --require ./scripts/tsx-windows-preload.cjs --import tsx scripts/p2-seo-http-qa.ts https://livasports.com --budget=100 --focus=entities
```

Concurrency 3, 30 s timeout, one retry with backoff, `/go/` never followed, sitemaps validated structurally without requesting their URLs. Detailed JSON in `output/p2-seo-qa-production*.json` (ignored).

Final runs on `38f782a`:

| run | requests | checks | failed |
|---|---|---|---|
| main matrix | 239 | 231 | **0** |
| entities focus | 99 | 91 | **0** |

Coverage: all 34 enabled competition entry pages × 3 locales (102), home/football/live/today, football with filter+tracking params, `?q=` search (noindex), unknown competition (HTTP 404), sign-in/account/My Matches (noindex, no user data in metadata), 3 help topics × 3 locales, legal, results/standings tabs, historical and explicit-default seasons, out-of-range page (noindex), tracking params, 9 match pages with normal, Googlebot and facebookexternalhit user agents (canonical/alternates identical), stale match slugs (308 → canonical), 9 teams + panel params, 8 players + tracking params, invalid match/team/player ids (404) in each locale, `/`, `/owner/preview`, `/go/betano` (redirect not followed), robots.txt, `/sitemap.xml`, `/sports-sitemaps.xml` and four entity batch files.

Earlier iterations of the same runs found and fixed: missing `og:image` on every page (Next replaces a parent `openGraph`), unknown `?competition=` answering 200, missing `BreadcrumbList` on English profiles, hreflang cluster on noindex profiles, plus two runner parser bugs (React's `hrefLang` casing, `&amp;`).

Provider calls attributable to QA: 0 — every request read Neon-backed caches only; `/api/internal/health` `lastFootballSync` stayed at `2026-09-14T06:45:49Z` throughout; `lastScoreSync` advanced only with the unrelated scheduled score refresh.

## Counts (production, 2026-09-17)

* `/sitemap.xml`: **510** URLs — 170 per locale; static hubs 12, legal 12, help 9, competition entries 102, tabs: results 99, standings 81, scorers 93, teams 102; 498 with `lastmod`; 0 entity URLs; 0 policy problems.
* `/sports-sitemaps.xml`: **214** files — matches 87 (130,164 URLs = 43,388 fixtures × 3), teams 5 (7,068 = 2,356 × 3), players 122 (182,265 = 60,755 × 3); every batch ≤1,500 URLs / <1 MB.
* Excluded by policy: 6 sign-in/account/My Matches URLs (3 locales × 2 families + My Matches), owner/QA/API/go/language/time-zone paths, search results, pending fixtures, empty tabs (102×5×3 = 510 possible tab URLs → 477 listed), out-of-range pages, thin profiles (`noindex`).
* Canonical conflicts before → after: every competition tab/page collapsed onto the fixtures URL (4 tabs × 34 × 3 = 408 self-canonicals missing) → 0; bogus season ids in canonicals → 0.
* Broken internal/alternate links found: 0 in 322 checked pages; hreflang clusters self-inclusive and reciprocal on every indexable page checked.

## Performance (production, warm/cold mixed, single-region client)

| page | before (2026-09-17 morning) | after (final run, n / p50 / max ms) |
|---|---|---|
| `/sitemap.xml` | 18.7 s (uncached full entity scans) | 0.4–0.7 s |
| `/sports-sitemaps.xml` | 44 s cold | 0.08–0.4 s (24 h counts cache) |
| entity batch files | 28–50 s cold | 0.2–1.2 s warm; cold player batches 10–12 s until migration 024 is applied |
| home | — | 3 / 697 / 1929 |
| football hub | — | 3 / 4790 / 7394 (pre-existing: full-board render, not changed by P2) |
| competition hub | — | 102 / 793 / 3137 |
| match | — | 9 / 1065 / 1492 |
| team | — | 9 / 1221 / 1795 |
| player | — | 8 / 2037 / 4982 |
| help | — | 3 / 288 / 343 |

No field Core Web Vitals are claimed; these are server response times from one client. Metadata reads share the page's cached loaders (no duplicate hub/profile queries). Layout checked at 375 (dark) / 390 (light) / 1440 with no horizontal overflow; season chips reuse the existing `.sports-profile-contexts` style.

## Regressions checked

| area | result |
|---|---|
| Auth / owner isolation | PRODUCTION TESTED — sign-in 200 noindex; account signed-out → noindex client redirect; owner preview noindex; no emails/tokens in metadata (231+91 checks) |
| Favorites / My Matches | PRODUCTION TESTED — page renders, noindex, no user data; code untouched except metadata |
| Guest My Slip | NOT RUN (client-side; code untouched) — slip drawer visible on hub screenshots |
| Independent bookmaker odds / fallback | NOT RUN (code untouched; odds modules not in the diff) |
| Affiliate / GEO | PRODUCTION TESTED — `/go/betano` not followed, `/go/` disallowed in robots; code untouched |
| Public sports pages | PRODUCTION TESTED — 102 hubs, tabs, seasons, 9 matches, 9 teams, 8 players, 404s |
| Themes / mobile | USER-VISIBLE CHECK — screenshots at 375 dark, 390 light, 1440 light |

## Remaining owner actions

1. Apply migration 024 (`corepack pnpm db:migrate` with production env) — adds two indexes for player sitemap eligibility; until then cold player batch files take ~10 s once per 6 h.
2. Search Console / Bing verification and sitemap submission — `docs/P2_SEARCH_CONSOLE.md`.
