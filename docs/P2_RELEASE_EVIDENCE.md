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

## P2 closure — 2026-09-17 (afternoon)

### Search Console sitemap blocker (fixed)

Google Search Console reported `/sitemap.xml` "Sitemap can be read, but has errors — Parsing error, line 280". Production body at that time: line 280 was `<loc>https://livasports.com/br/futebol?competition=premier-league&tab=results</loc>` — a raw `&`. Root cause: Next.js's `MetadataRoute.Sitemap` writer (`src/app/sitemap.ts`) does not XML-escape `<loc>`/`href` values, and P2 introduced the first two-parameter URLs; 1,875 lines carried a raw `&`. Fix (`77e1c0c`): `/sitemap.xml` is now a route handler (`src/app/sitemap.xml/route.ts`) that serialises the same policy output through the existing `xml()` escaper (`src/seo/sitemap.ts#primarySitemapXml`), `Content-Type: application/xml; charset=utf-8`; `sitemapXmlProblems()` well-formedness checks were added to unit tests and to `scripts/p2-seo-http-qa.ts`. The healthy `/sports-sitemaps.xml` implementation was not changed. Verified anonymously (Googlebot UA) after deploy: HTTP 200, 510 URLs, 1,875 `&amp;`, 0 raw `&`, valid UTF-8; browser `DOMParser` (`application/xml`) reports no `parsererror` for `/sitemap.xml`, `/sports-sitemaps.xml` and the `matches-0`, `teams-0`, `players-0` shards; namespaces `sitemaps.org/schemas/sitemap/0.9` + `w3.org/1999/xhtml`; elements limited to `urlset/url/loc/lastmod/xhtml:link` and `sitemapindex/sitemap/loc`; all `lastmod` parse as W3C datetimes; 0 private URLs; 0 non-production hosts. Resubmission in Search Console is an owner step.

Measured timings (production, Googlebot UA): `/sitemap.xml` first 1.7 s / repeat 5.3 s and 3.1 s / 5.2 s (both function hits; Vercel edge did not report HIT for the dynamic route). `/sports-sitemaps.xml` first fetch after a deployment **36.3 s** (counts cache is per deployment), repeat 0.37 s; `players-0.xml` first 14.8 s cold / 0.4–0.8 s warm; `matches-0` 0.5 s; `teams-0` 0.7 s. Residual risk: the first index/shard fetch after each deployment is cold (10–40 s). Not changed here per instruction; smallest remedy if it recurs in Search Console is edge `s-maxage`/`stale-while-revalidate` on the sports routes.

### Migration 024 — APPLIED (narrowed)

Review against production (Neon `neondb`, PostgreSQL 18.6, `schema_migrations` 001–023 recorded, 024 the only pending file): `fixture_lineups` 1.28 M rows / 231 MB; `fixture_player_statistics` 15.0 M rows / 2.46 GB with two 1.6 GB indexes and live ingestion writes. A non-concurrent index on the statistics table inside the runner's single-transaction execution would hold a SHARE lock for minutes and `CONCURRENTLY` is unavailable there, so the unapplied file was narrowed (`88d66dd`) to the lineups index only; the statistics table's primary key already serves an index-only scan of `player_id`. Applied with the runner's semantics (whole file in one query, then the `schema_migrations` row) from process memory only — no credential written to disk or shown. Result: 985 ms, recorded exactly once, `fixture_lineups_player_entity_idx` valid/ready/live (10 MB), no invalid indexes in the database, no blocked locks, production reads healthy afterwards. Caveat: the pg client's `lock_timeout`/`statement_timeout` startup parameters were reported as `0` by the Neon session, so those guards were not in force; the build completed in under a second with no waiting lock.

### Omitted product regressions — closed (PRODUCTION TESTED)

`POST /api/slip/compare` with current persisted quotes (read-only selection from `odds_current`, no forced price differences):

* A — 3-leg slip, both bookmakers holding independent real prices (e.g. 5,40 / 5,70; 3,55 / 3,70; 1,85 / 1,87): Betano `COMPLETE` 3 REAL, combined 39.4383; Betsson `COMPLETE` 3 REAL, combined 35.4645; every REAL price equals that bookmaker's own stored quote; combined = product of the prices used; HTTP 200, `private, no-store`, `providerRequests: 0`.
* B — 5-leg mixed: 3 independent legs + 2 legs quoted only by Betsson: Betano `ESTIMATED_COMPLETE` 3 REAL + 2 PROXY (source `betsson`, prices 3,50 / 2,87), combined 182.07567; Betsson `COMPLETE` 5 REAL, combined 179.152575; own prices always took priority over the other bookmaker's quote (legs where Betano's own quote was fresher were resolved REAL, not PROXY); totals equal the product of the prices used; `providerRequests: 0`.
* Browser (production, guest slip): stake 10 → R$ 394,40; stake 25 → R$ 986,00 (stake × 2-dp displayed combined, per `src/slip/decimal.ts`); remove → 2 legs persisted through reload with stake 25; clear (confirmation "Remover todas as seleções?") → 0 legs, stake reset to 10, persisted through reload. Odds resolution intentionally pauses while the tab is hidden; it resolved within ~1 s once visible.

Provider calls attributable to this QA: **0** (request-scoped `providerRequests: 0` on every compare; the only activity in the window was one scheduled SCORES ingestion run at 13:40:11 and one scheduled odds job request at 13:40:09 with `job_id` set).
