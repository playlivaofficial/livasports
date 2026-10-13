# LivaSports SEO Growth Engine for Mexico Colombia and Peru

13 October 2026. Branch `codex/seo-growth-engine-mx-co-pe`. This release extends the existing regional Growth Engine with useful football education, domestic discovery links and repeatable acceptance checks. It preserves odds, My Slip, affiliate destinations, commercial eligibility and automatic growth safeguards. The concurrent indicative-slip release is included through main `ac111f04e0f1bfb4f47cf99e6e54f9e628ac679c`.

## Production baseline

The authenticated owner SEO dashboard was read on 13 October. Google ingestion is CONNECTED, last completed at 05:41 UTC, with 25 observed reporting days and 14,778 stored rows. Daily ingestion is scheduled for 05:40 UTC. The 28-day window is 13 September–10 October; the three-day reporting lag keeps incomplete days out of comparisons.

| Measure | Mexico | Colombia | Peru |
| --- | --- | --- | --- |
| Regional pages 28d clicks / impressions | 6 / 5,233 | 0 / 547 | 3 / 1,220 |
| Regional pages 28d CTR | 0.11% | 0.00% | 0.25% |
| Searcher country 28d clicks / impressions across all languages | 6 / 2,000 | 0 / 513 | 2 / 828 |
| Regional page and matching country intersection | 3 / 909 | 0 / 93 | 0 / 341 |
| Regional mobile clicks / impressions | 3 / 1,175 | 0 / 160 | 1 / 663 |
| Regional pages 7d clicks / impressions | 4 / 1,508 | 0 / 547 | 3 / 1,220 |

The site-wide 28-day total is 36 clicks and 16,231 impressions, approximately 0.22% CTR; the Google UI rounds CTR to 0.2% and shows average position 17.2. These are pre-release measurements. Regional URL intent and searcher location are different dimensions; privacy suppression prevents their totals from reconciling. CO and PE have regional rows on only five and six days. The baseline does not establish a statistically reliable conversion rate or forecast.

Google Page Indexing, updated 9 October, reports 25,713 indexed and 24,407 excluded known pages. Exclusions include 18,990 discovered but not indexed, 203 crawled but not indexed, 4,821 noindex, 213 redirects, 69 duplicate without a selected canonical, 92 Google-selected different canonicals, 15 canonical alternates and four soft 404s. These historical site-wide figures are not the current sitemap denominator. Mobile and desktop Core Web Vitals both report No data. Three old invalid Events remain in Google's enhancement report; passing current markup does not mean Google has recrawled them.

The bounded public crawl at 13:33 UTC used 64 requests and found 24,293 unique submitted URLs with no sampled canonical, hreflang, status, XML or tracking-canonical failures. The owner's earlier 05:41 snapshot had 24,344 submitted URLs; retention and fixture timing explain why timestamped inventories differ. Production robots allowed public URLs and declared both sitemaps. The site-wide crawl is a bounded sample, not a claim that every entity was fetched.

## Audit decisions and implementation

| Surface | Finding and action |
| --- | --- |
| Crawling and canonicals | Existing public 200s, slug correction, true 404s, semantic competition tabs and tracking canonicalization passed. Retained their central policy. |
| Regional signals | Existing es-MX, es-CO, es-PE, pt-BR, en and x-default clusters passed. New guides use the same reciprocal route and sitemap policy. |
| Useful content | Help covered comparison, decimal odds and favorites, but lacked worked 1X2, total-goals, BTTS and same-selection slip examples. Added two topics with Spanish regional context and English/Portuguese translations. |
| Country intent | Comparison pages reused generic Spanish copy. Added distinct regional titles, domestic league context and currency examples. Mexico's Today page lacked country intent; its title/H1 and description now identify Mexico and actual schedule content. |
| Price accuracy | Help claimed every quote expires after 15 minutes. The production quote policy uses stored or computed validity by quote and time to kickoff. Corrected this in Spanish, English and Portuguese. |
| Internal linking | All guides are linked by the existing public footer. Four non-favorites topics per locale now link to the domestic fixtures, results and standings hub plus Today. No direct affiliate destinations were introduced. |
| Structured data | Help previously had breadcrumbs only. All 25 guides now emit Article and BreadcrumbList with visible titles, language, canonical, organization attribution and reviewed date. No invented publication dates, ratings, prices or ticket offers. |
| Test coverage | Added a real HTTP acceptance command to CI, covering all 25 guides, XML alternates, one H1, canonical, robots, schema, review dates, footer discovery and domestic links. Preview remains noindex and disallowed. |
| Growth measurement | Existing owner 7/14/28-day reports, country intersections, HUMAN funnel, independent GEO ranking and GSC access are functioning. Retained existing storage, schedules, confidence gates, action caps and rollback policy. |

### Pages and routes

The existing 15 help pages remain. Ten new URLs add two topics across five variants; six target MX/CO/PE, and four complete the existing English/Portuguese language clusters.

| GEO | Market explanation | Slip comparison | Domestic hub |
| --- | --- | --- | --- |
| MX | `/mx/mercados-1x2-goles-ambos-marcan` | `/mx/como-comparar-mi-boleto` | `/mx/futbol?competition=liga-mx` |
| CO | `/co/mercados-1x2-goles-ambos-marcan` | `/co/como-comparar-mi-boleto` | `/co/futbol?competition=colombia-primera-a` |
| PE | `/pe/mercados-1x2-goles-ambos-marcan` | `/pe/como-comparar-mi-boleto` | `/pe/futbol?competition=peru-liga-1` |

The existing `/{locale}/como-funciona-la-comparacion-de-cuotas` URL identity remains. Its regional title, context and related links improve without replacing the route. The English and Portuguese new slugs are registered centrally; existing language switching maps each topic correctly. The primary sitemap adds exactly ten guide entries before time-dependent competition changes. Reviewed dates, Open Graph modified time, visible date and Article date agree. Favorites retains its original 17 September review date.

## Search intent and editorial priorities

The owner report contains actual query evidence. For example, the current PE 7-day opportunity for Today has 109 page impressions at position 13.6; the reported query “partidos de hoy perú” has 38 impressions. MX's Paulinho profile has 86 page impressions and one click in 7d; its observed query concerns shots on target. Many top CO/PE queries concern foreign fixtures. A regional route alone does not prove demand for a domestic league.

Public search results also contain comparison products and market explanations for Mexican momios, Colombian Liga BetPlay and Peruvian Liga 1. This supports the content format and terminology as a qualitative hypothesis. No search-volume, keyword-difficulty, market-share or ranking estimate is invented.

| Priority | Intent | Destination and next action |
| --- | --- | --- |
| P1 MX | Partidos de hoy México, Liga MX calendario/resultados/tabla, momios y cuotas 1X2 | Existing Today and Liga MX hub; new markets/comparison guides explain identity before users open an actual match. |
| P1 CO | Liga BetPlay calendario/resultados/posiciones; comparar cuotas de fútbol | Existing Primera A hub and tab canonicals; clarify phase and distinguish Primera B. Collect local query evidence before expanding. |
| P1 PE | Partidos de hoy Perú, Liga 1 calendario/tabla; comparar cuotas | Existing Today and Liga 1 hub; new guides distinguish date, stage, market and price coverage. |
| P2 all | Más/menos 2.5, ambos marcan, cuota combinada, ≈, retorno frente a ganancia | Two new evergreen guides with worked scorelines and same-book examples. Each leads to covered real matches. |
| P2 all | Team schedule, real lineups, persisted results and statistics | Existing factual entity pages. Refresh only from supported data; preserve empty-state and retention rules. |

The intended journey is Search → useful regional guide or domestic hub → actual fixture → identical selections in My Slip → comparison → existing eligible tracked sportsbook visit. Educational examples are not live prices. Approximate values never become executable bookmaker-issued prices. Outbound visits retain their existing independent eligibility and tracking.

## Operating rules and acceptance

Keep existing daily GSC sync, technical snapshots, sitemap hash deduplication, GEO Top 5 rotation and Autopilot. Viewing reports must make no new odds-provider requests. Country quotas remain independent; historical BR traffic does not become active BR commercial targeting. Do not reset existing experiments or weaken sparse-data thresholds.

Local release gates are lint, full tests, build, typecheck, secret scan and `pnpm qa:seo:growth`. The last command starts a bounded localhost build check with preview noindex protection and stops its server. Public guide acceptance uses `node --require ./scripts/tsx-windows-preload.cjs --import tsx scripts/seo-growth-check.ts https://livasports.com`; the broader sampled crawl remains `node scripts/geo-seo-audit.mjs https://livasports.com`. Neither command invokes ingestion, affiliate redirects, owner mutations or provider refreshes.

Release evidence, exact final SHA, hosted CI, preview and live production acceptance are recorded in the output handoff. The SEO diff must remain free of odds, slip, affiliate, authentication, scheduler, database and commercial-policy changes. The other chat owns its separate PR #64 slip release.

## Thirty sixty and ninety day execution

Dates assume release on 13 October. Technical acceptance targets are engineering requirements; traffic targets below are planning hypotheses subject to Google and the small baseline.

| Deadline | Work and responsible role | Measurable acceptance |
| --- | --- | --- |
| 12 November 2026 day 30 | Existing engine continues daily sync and rotation. SEO owner reviews the three domestic clusters weekly, uses five genuine upcoming matches per GEO, and inspects the six new regional guide URLs in Search Console. Engineer repairs reproducible failures. | 25/25 guides keep passing the public gate; no canonical/schema regressions; complete daily ingestion without truncation; all six target guides have documented Google crawl/index status. Target at least one newly indexed guide per GEO, recording actual Google status rather than request acceptance. |
| 12 December 2026 day 60 | SEO owner evaluates complete 28-day windows by regional page and searcher country. Test at most one qualified title/description hypothesis per GEO at a time, retaining current confidence gates and cooldowns. Review organic guide → fixture → slip → comparison → approved visit drop-off. | Report absolute clicks, impressions, CTR and HUMAN events with denominators. Aspirational matching-country regional clicks: MX at least 5, CO at least 1, PE at least 1 per complete 28d, against baseline 3/0/0. No experiment is a winner merely because the first click arrives. |
| 11 January 2027 day 90 | SEO owner allocates editorial work from observed domestic demand, retains useful archives, and rolls back experiments that meet existing failure rules. Engineer acts on real mobile performance evidence. | Planning targets for regional 28d clicks: MX 10, CO 3, PE 6 against baseline 6/0/3. Report actual values even if targets fail. Technical target remains zero new SEO failures; compare qualified funnel rates only with adequate samples. Decide expansion from evidence, not sitemap growth. |

Each weekly scorecard records release date, complete data window, country and regional path, clicks, impressions, weighted position, mobile CTR, actual guide index status, HUMAN organic entrances, match views, slip additions, comparisons and approved outbound visits. Missing or suppressed data is unavailable rather than zero. Exclude OWNER, QA, BOT, paid and direct traffic from organic funnel claims. No revenue or acquired-player claim follows from an outbound click.

Content expansion stays small: first answer observed questions on existing pages; publish a new guide only when it adds a distinct explanation. No automated doorway pages, fabricated previews, backlinks, outreach, new paid tools or social/media activation are included. Existing authority outreach remains manual and requires the owner's separate instruction to contact anyone.

## Remaining Google and performance evidence

The discovery backlog and Google-selected canonicals remain external outcomes. Sample conflicts include mirrored foreign-club/player regional pages, so review factual usefulness and locale duplication before changing central entity policies. Do not turn a small sample into a mass noindex operation. Old event and soft-404 exclusions need current live inspection and Google's recrawl; no validation success is claimed from code alone.

Real-user Core Web Vitals are unavailable in Google. Local responsive rendering verifies layout, not field LCP, INP or CLS. The existing client bundle, commercial scripts and odds scheduler are unchanged by this release. A performance follow-up should use real field evidence when available; new server-rendered guides add no custom client bundle or provider reads.

## Sources

First-party baselines: authenticated [LivaSports SEO dashboard](https://livasports.com/owner/growth/seo) and [Search Console](https://search.google.com/search-console?resource_id=sc-domain%3Alivasports.com), read 13 October 2026. Quote examples and lifetime descriptions are verified against the repository's real comparison and calculation policy.

Technical guidance: [Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization), [sitemap lastmod](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping) and [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). Qualitative comparison-format evidence includes [CuoteX](https://www.cuotex.com/) and [Betarvo Peru](https://betarvo.com/es-pe/futbol/); their search-result presence does not establish search volume or endorse their claims.
