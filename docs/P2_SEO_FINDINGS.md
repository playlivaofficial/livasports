# P2 — SEO audit findings and implemented fixes

One focused audit of `main@1ff0ca0` (route tree, metadata, proxy, sitemaps, robots, tests, production responses on 2026-09-17), then implementation. Classification: **ALREADY CORRECT** (kept), **NEEDS CHANGE** (fixed in P2), **EXTERNAL CHECK** (needs owner/tool access).

| # | Surface | Evidence (before) | Class | Impact | Fix (after) |
|---|---|---|---|---|---|
| 1 | Competition hub canonical | `src/sports/metadata.ts` dropped `tab` and `p`, kept any well-formed `?season` even when unresolvable | NEEDS CHANGE | results/standings/scorers/teams and every page collapsed onto the fixtures URL; bogus season UUIDs minted canonical identities | `competitionCanonical()` from the resolved hub: tab, non-default season, in-range page; unknown season dropped |
| 2 | Competition title/description | metadata never loaded the hub | NEEDS CHANGE | historical seasons mislabeled as current; all tabs shared one title | shares the react-cached `loadCompetition` with the page (no extra query); names resolved season/tab/page |
| 3 | Unknown `?competition=` | generic 200 listing | NEEDS CHANGE | soft-404 | `notFound()` for slugs outside the registry; registry-known but unavailable → 200 + `noindex,follow` |
| 4 | My Matches | no robots directive, hreflang cluster present | NEEDS CHANGE | personalised page indexable | `noindex,follow`, cluster removed |
| 5 | Sign-in / account / pending fixtures | noindex present, hreflang clusters present | ALREADY CORRECT (tidy) | clusters on noindex pages are noise | clusters removed, canonical kept |
| 6 | `/sitemap.xml` | uncached full eligibility scans on every request (18.7 s measured in production), 200 entity URLs duplicated from `/sports-sitemaps`, `changefreq=daily` everywhere, no `lastmod` policy | NEEDS CHANGE | slow, duplicate URLs | hubs + documents + competition entries/tabs only; one bounded summary query cached 1 h; `lastmod` only from source dates |
| 7 | `/sports-sitemaps/*.xml` | 28–50 s cold per batch (OFFSET over the eligibility CTE), 300 s cache | NEEDS CHANGE | crawl timeouts | data cache 6 h + 24 h stale-if-error; query unchanged (no local DB to measure a rewrite — see Release evidence for measured production timings) |
| 8 | `robots.txt` | production allowed everything | NEEDS CHANGE (minor) | `/go/` tracking redirects and `/api/` crawlable | disallow `/api/ /go/ /owner/ /qa/ /language /time-zone`; query URLs untouched |
| 9 | Preview safety | `VERCEL_ENV!==production` → `Disallow: /` + `noindex` meta | ALREADY CORRECT | — | kept; tested for production/preview separation |
| 10 | hreflang | `pt-BR/es-MX/en/x-default=en`, reciprocal | ALREADY CORRECT | — | centralised in policy; reciprocity + self-inclusion tested for every enabled competition × tab × locale |
| 11 | Entity canonicals, 308 slug correction, edge 404 for unknown ids, DB-outage pass-through | `src/proxy.ts`, pages | ALREADY CORRECT | — | kept; profile loads wrapped in `react.cache` so metadata and body share one read |
| 12 | JSON-LD | SportsEvent/SportsTeam/Person/BreadcrumbList present; serializer duplicated 3× escaping only `<` | ALREADY CORRECT (partial) | no site-level entity; hubs had no breadcrumb | shared serializer (also `>`, `&`, U+2028/9); Organization+WebSite on home; hub BreadcrumbList |
| 13 | Open Graph | no image anywhere (no brand asset existed); legal pages had no OG | NEEDS CHANGE | poor social previews | static `opengraph-image.png` (1200×630, from the existing header mark), `icon.svg`, article OG on legal/help |
| 14 | Historical season discovery | only a `<select>` form | NEEDS CHANGE | not crawlable | ≤6-season link list under the form; tab links use canonical form |
| 15 | Evergreen help | none | NEEDS CHANGE | — | 3 topics × 3 locales through the existing `[document]` route, footer links, language-selector mapping |
| 16 | Streaming metadata (Next 16.3) | default `htmlLimitedBots` | EXTERNAL CHECK | — | production QA fetches match pages with normal, Googlebot and facebookexternalhit UAs |
| 17 | Search Console / Bing | no verification in repo or accessible credentials | EXTERNAL CHECK | — | `docs/P2_SEARCH_CONSOLE.md` |

Changed test requirements (equivalent protection retained): `src/sports/policy.test.ts` previously asserted that all tabs and pages canonicalise to the fixtures URL — replaced by `src/sports/metadata.test.ts` (per-tab canonicals, reciprocal clusters, search noindex, historical season context). `src/localization/seo.test.ts` previously expected 135 sitemap rows including entities — now expects `(4+4+3+enabled competitions)×3` rows without entities, derived from the live registry count. `src/sports/CompetitionPanel.test.tsx` previously expected the current season id in every tab link — now expects it only for non-default seasons.

Not changed (out of scope, verified untouched): auth/session code, favorites merge, guest slip, odds normalisation/pricing/proxy presentation, affiliate `/go` tracking and GEO gating, themes and layout CSS, provider ingestion and schedulers.
