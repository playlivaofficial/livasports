# MX / CO / PE SEO and organic growth audit

Audit date: 9 October 2026. Starting production/main: `e0daf6aebe611c5e2866d919ff2f2fe56dc965e0`. Release branch: `codex/geo-seo-growth-audit`. Release identifiers and post-deployment acceptance are recorded in the final release handoff; this document records reproducible findings and the execution plan, not a claim that Google has recrawled the release.

## A. Current findings

The country migration is largely implemented: active commercial GEOs are MX, CO and PE; ROW is neutral; BR is commercially retired. Country ranking, separate Top 5, regional routes, country-aware Autopilot and Google ingestion already work. The verified gaps were incomplete owner measurement windows, generic regional landing metadata, missing structured data on general football/live/today boards and an oversized discovery-link block. A 320px filter-label collision was also repaired.

Audit methods: repository/configuration review, read-only production Neon queries, authenticated owner and Google Search Console UI, bounded public Googlebot HTTP crawl, rendered browser inspection and regression tests. No sports provider requests, ingestion, database writes, paid tools, manual indexing requests or media generation were needed. Google observations describe its indexed/reporting snapshot, not a live rendering guarantee.

## B. Brazil-first leftovers

- MX landing metadata lacked Mexico-specific intent; CO/PE football/live boards inherited generic Spanish metadata. Corrected with factual regional titles/descriptions and existing domestic competition context.
- Owner inventory commentary incorrectly described three mirrored locales. It now acknowledges all regional variants and intentional differences caused by publication/retention eligibility.
- BR URLs, Portuguese translations, football history and historical analytics/experiments remain intentionally preserved. They are not new BR commercial priority or affiliate activation. Legacy BR experiments are frozen; active Autopilot GEOs are MX/CO/PE.
- No inappropriate BR currency, source-entitlement, affiliate or ranking rule was found in the active country pipeline. These rules were not changed.

## C. Already correctly adapted

`src/config/geo.ts` defines independent domestic demand seeds, MXN/COP/PEN and country timezones. `src/localization/interface.ts` distinguishes regional route signals from the three public language choices. Language does not establish trusted commercial GEO. `src/proxy.ts` is narrow: explicit regional entity routes are not redirected solely by crawler IP.

`src/seo/policy.ts`, `src/seo/sitemap.ts` and `src/sports/sitemap-repository.ts` retain semantic competition tab/season/pagination canonicals, reciprocal regional alternates, empty/pending/search noindex rules and useful historical URLs. `src/sports/match-seo.ts` already omits SportsEvent when genuine location data is unavailable; it does not invent venues or ticket offers.

Growth scoring, confidence gates, bounded feedback, fixture rotation, database persistence, cache/ISR, SEO publish quality checks, OAuth write scope, sitemap hash deduplication and media shutdown are existing working implementations. Migrations 058/059 already establish GEO isolation; this release needs no migration.

## D. Repairs

- Country-specific MX/CO/PE metadata without changing actual GEO eligibility.
- Factual CollectionPage and BreadcrumbList schema on football boards; root homes omit an artificial one-item trail. No fabricated SportsEvents or bookmaker offers.
- Compact existing Top 5 internal links instead of the large public prominence cards. Featured fixture badges remain.
- Owner-only 7/14/28-day views: regional URL intent, Google searcher country, their intersection, mobile measurements, previous comparable windows and independent query/landing-page samples.
- Four bounded bulk database reads; no new Google/provider fetch on navigation. Incomplete or suppressed data is explicitly unavailable, not invented zero traffic.
- Narrow-phone filter labels/counts remain readable with existing 44px targets.
- A reusable credential-free public audit: `node scripts/geo-seo-audit.mjs https://livasports.com`. Maximum 75 HTTP requests; no mutation/provider endpoints; validates sitemap XML, metadata, regional reciprocity, redirects and tracking canonicals.

## E–G. Country strategy and status

Each country retains self-canonical regional pages with `es-MX`, `es-CO`, `es-PE`; public language choices remain Español / Português / English. All three homepages were confirmed **indexed** using Google's URL Inspection UI. Domestic competition hub, standings/results/pagination, match and team families are represented in the bounded crawl.

| GEO | Initial priority intent | Existing destination pattern | Evidence / decision |
| --- | --- | --- | --- |
| MX | Liga MX schedule/results/table; Mexican club fixtures; Liga de Expansión; Champions League, Premier League, La Liga | `/mx/futbol?competition=liga-mx`, existing enabled competition slugs, `/mx/equipo/<canonical>`, `/mx/partido/<canonical>` | Largest regional impression sample; improve CTR only where current confidence gates qualify. |
| CO | Liga BetPlay / Primera A; Colombian clubs; Libertadores/Sudamericana; Champions/Premier League | `/co/futbol?competition=colombia-primera-a`, existing club and match canonicals | Sparse regional performance; prioritize useful domestic discovery and collect evidence before declaring winners. |
| PE | Liga 1; Peruvian clubs; Libertadores/Sudamericana; Champions/Premier/La Liga | `/pe/futbol?competition=peru-liga-1`, existing club and match canonicals | Sparse regional performance; same measurement-first approach. |

Within these families, map Spanish intent to actual data: “partidos de hoy / próximos partidos” → schedule; “resultados / marcador” → result; “tabla / posiciones” → standings; “alineaciones” → real lineups; team/player queries → genuine profiles; “cuotas 1X2 / más menos 2.5 / ambos marcan / comparar casas” → existing match markets and comparison help. Create no fake club IDs, unsupported national-team coverage, speculative previews or mass keyword doorway pages. Domestic weights are starting hypotheses, not search volumes or rigid rankings. Refine with actual query/page/country evidence and fixture demand.

## H. Independent Growth Top 5

Database inspection at approximately 12:36–12:59 UTC found **five future scheduled fixtures per GEO**, independently ranked at 10:17:14 UTC:

- MX: Puebla–León; Tigres–Toluca; Liverpool–Manchester City; Real Madrid–Villarreal; Arsenal–Leeds.
- CO: Alianza Petrolera–Rionegro Águilas; Once Caldas–Llaneros; Liverpool–Manchester City; Real Madrid–Villarreal; Arsenal–Leeds.
- PE: Manchester United–Tottenham; Deportivo Garcilaso–Sport Huancayo; ADT–FC Cajamarca; Liverpool–Manchester City; Real Madrid–Villarreal.

Existing automatic cycles at 10:17 / 16:17 / 22:17 UTC persist independent choices and exclude finished fixtures. Ranking considers competition/club demand, kickoff, relevance and bounded engagement/search feedback. Current 13 feedback profiles per GEO have zero adjustment because sufficient evidence has not accrued; no unsupported “learning success” is claimed. The compact links and Featured badges expose priorities without restoring giant public panels. No media render or automatic publishing was activated.

## I. SEO Autopilot

The latest five daily runs succeeded. Active GEOs are MX/CO/PE; allocation is round-robin with minimum candidate representation rather than one globally dominant country. Current global limits remain five new indexable pages/day, twelve candidates, ten refreshes, a 500-page inventory and ninety-day retention. A published-count summary may include retained pages; it is not a count of newly created pages.

Keep confidence thresholds, factual content/publish checks, bounded experiments, 28-day cooldown and 56-day rollback. Existing optimization caps remain one title change, three links and four total actions/day. This audit does not change scoring, thresholds, scheduling or sitemap submission cadence. Search/privacy sparsity is an explicit blocker to broad optimization, not a reason to weaken gates.

## J. Google Search Console

Property: `sc-domain:livasports.com`; stored live health on 9 October reports `siteOwner`, full `WEBMASTERS` scope, analytics read OK, sitemap read OK, sitemap write OK and no last submission error. Latest successful primary sitemap submission: **2026-10-09T07:11:04Z**. Google UI confirms primary sitemap Success/read 9 October and sports sitemap Success/read 8 October. A sports-sitemap cooldown/BACKOFF without error is intentional, not an authorization failure. No unchanged sitemap was manually resubmitted.

Latest daily Google ingestion completed at 05:40:52 UTC: 11,862 rows, 21 observed reporting days, no truncation; country/device/query breakdowns succeeded. The audit uses stored authenticated measurements and signed-in Google UI. A separate CLI attempt to read Vercel's environment catalog returned HTTP 403 before accessing credentials; it is not evidence that Google authentication is broken. No token was copied, logged or rotated.

Google Page Indexing (report updated 4 October): 21,558 indexed; 13,358 excluded. Exclusions: discovered-not-indexed 12,056; crawled-not-indexed 212; intentional noindex 887; redirects 136; duplicate without selected canonical 59; alternate proper canonical 6; soft 404 one; Google-selected different canonical one. These are site-wide historical reports, not country-specific counts or current sitemap denominators.

The one soft-404 example, Shirebrook Town, currently returns a genuine profile with founded/country information and persisted 2024/25 FA Cup statistics (one loss, goals 1–2), but lacks current fixtures/squad. Monitor its low-value profile classification; do not invent content or force indexing. Sample legacy duplicate query URLs now canonicalize to base profiles. Historical Birkirkara–B36 now has noindex and breadcrumbs only. Google's Events report still contains 21 old missing-location errors; sampled current output no longer emits invalid SportsEvent. Pending Google recrawl is not a completed Google validation.

## K. Sitemap / index inventory

Production database contains **41 enabled competitions**; do not reuse the obsolete 34-entry registry as current fact. Stored technical snapshot on 9 October: 24,598 submitted URLs: BR 4,915; CO 4,920; EN 4,921; MX 4,921; PE 4,921. Families: teams 12,105; matches 11,518; competition variants 920; content 35; five each of home/football/live/today. Its 24-page sample found no problems.

The later live XML crawl contained **24,596 unique submitted URLs** (PE 4,919; other locale counts unchanged). Time-dependent retention explains why snapshots need timestamps, not forced equal totals. Google's sitemap UI separately reports 975 discovered in the primary sitemap and 24,233 in the sports index; these older/possibly overlapping reports must not be summed as unique indexed URLs. No trustworthy per-GEO indexed-page total is exposed by the current integration; do not derive it from URL inventory or search impressions.

## L. Actual organic baseline

Reporting ends 6 October with a three-day lag. Windows: 7d = 30 September–6 October; 14d = 23 September–6 October; 28d = 9 September–6 October. Counts are Google's reported rows, subject to privacy/dimension suppression.

| Regional URL intent | 7d clicks / impressions / CTR | 14d | 28d |
| --- | --- | --- | --- |
| MX | 1 / 1,456 / 0.069% | 2 / 2,934 / 0.068% | 3 / 4,349 / 0.069% |
| CO | 0 / 15 / 0% | 0 / 15 / 0% | 0 / 15 / 0% |
| PE | 0 / 38 / 0% | 0 / 38 / 0% | 0 / 38 / 0% |

MX has regional rows on 7/14/21 days respectively; CO one and PE two days. A complete fetch window is not evidence of daily impressions. Google searcher-country totals across **all** site languages differ:

| Google country | 7d clicks / impressions | 14d | 28d |
| --- | --- | --- | --- |
| Mexico | 1 / 441 | 2 / 1,005 | 3 / 1,316 |
| Colombia | 0 / 70 | 0 / 118 | 0 / 186 |
| Peru | 0 / 104 | 0 / 185 | 0 / 298 |

Regional-page × matching-country intersections (7/14/28): MX 1/282, 2/516, 3/688; CO 0/2 each; PE 0/10 each. Regional mobile: MX 1/227, 2/407, 3/941; CO 0/2 and PE 0/10 each. These dimensions do not sum to overall totals.

Reported 28d examples: MX query “alineaciones birmingham middlesbrough” 185 impressions/zero clicks; Paulinho landing page 189/zero. CO query “al raed” one impression/zero; Coritiba page two/zero. PE “partidos bragantino” five/zero; Bragantino page eleven/zero. These are observations, not demand estimates or successful domestic ranking claims. First-party HUMAN organic sessions also remain sparse; no measured CO/PE session row is not proof of zero Google visitors.

## M. Technical defects fixed and preserved boundaries

The initial public crawl found fifteen boards without structured data across five variants. They now emit factual CollectionPage/BreadcrumbList. Regional metadata and compact internal links are tested. 320px filters no longer collide. Owner data now separates geography/intent and complete/partial fetch coverage.

Unchanged: native REAL odds identity/freshness, exact-outcome informational reference policy, signed admission and changed-price confirmation, same-book accumulators, odds quota/scheduler, owner/user auth, affiliate destinations, WAF and narrow middleware, language/GEO independence, cache/ISR, canonical retention and social/media shutdown. MX Betsson; CO Betsson+bwin odds; PE Inkabet+1xBet remain existing mappings. Only previously approved campaigns/CTAs may execute. Informational references have no betting action. No business algorithm or provider subscription was modified.

## N–O. Release and verification

Focused branch/PR flow is required: clean diff, feature commit/push, hosted verify, Vercel preview, review, normal merge and existing production project. No forced push/reset or new infrastructure. See final handoff for PR, deployed main SHA and deployment identifier.

Local final gates: **2,722 tests** (2,705 Vitest across 272 files plus 17 Node tests), typecheck, lint, production build and secret scan PASS. Rendered MX/CO/PE homes inspected at 1440/430/390/320 with zero horizontal overflow; no giant prominence panels; compact links and 44px controls preserved. Public crawl checks all five variants and representative competition/standings/results/pagination, genuine match/team, search noindex, real 404, canonical slug redirect, tracking canonical and reciprocal alternates. Production acceptance repeats the bounded crawl, owner measurement UI and actual-GEO responsive checks, plus cached DB-first reads and providerRequests=0.

## P. External requirements and limitations

No new paid service, provider package, account or credential is required. Google controls discovery, recrawl, canonical choice and rankings. Do not label excluded pages or old enhancement errors resolved merely because current markup passes. Core Web Vitals reports currently say **No data** for mobile and desktop; field CWV is unmeasured, not PASS. Continue bounded monitoring of the one soft 404 and historical event errors. A third-party affiliate iframe sandbox warning is not resolved by weakening browser security. Search/country privacy suppression and sparse CO/PE observations limit confident conclusions. No ranking or traffic guarantee is offered.

## Organic growth execution: next 30 / 60 / 90 days

### Days 1–30 — establish useful discovery and honest measurement

- Weekly owner review of each GEO's independent Top 5, domestic hub, upcoming genuine match pages and canonical coverage. Use existing automatic rotation; do not launch mass media or page generation.
- Measure 7/14/28 windows ending on Google's complete day. Track regional intent, actual searcher country, their intersection, mobile CTR, and HUMAN landing → match → slip → comparison → approved CTA separately. Exclude OWNER/QA/BOT activity.
- Triage the discovery backlog by useful page family, not raw count. Inspect a small prioritized domestic sample; keep empty/pending/search noindex and historical retention rules. Avoid repeated sitemap submissions and manual bulk indexing.
- Fix only evidence-backed factual, metadata or linking defects. CTR experiments require current confidence gates; CO/PE sparse data is an explicit hold, not permission to force changes.
- Baseline success: daily ingestion/cycles healthy, no canonical/schema regressions, independent data visible, no provider-cost regression. Traffic is measured, not promised.

### Days 31–60 — controlled intent and conversion improvements

- Compare equal-length complete windows by GEO and device. Separate season/fixture changes from editorial effects; do not attribute all movement to this release.
- Use qualified query/page evidence for small title/description/link experiments on existing domestic hubs, team profiles and real match previews. Keep caps/cooldowns/rollback and factual publish checks.
- Review useful lineup/standings/results intent coverage and archived-page value. Expand only genuine supported data/context, not thin keyword pages or unsupported claims.
- Audit organic funnel drop-off and fresh selectable market availability without changing affiliate eligibility or freshness to manufacture conversions. Strengthen only approved, clearly disclosed destinations.
- Reassess Google recrawl/soft-404/event status and field CWV availability. If sufficient real measurements identify a bottleneck, repair it through a separate bounded engineering change.

### Days 61–90 — evidence-led allocation

- Rebalance domestic/international demand only when per-GEO real engagement/GSC confidence gates qualify. Low-volume countries keep independent minimum representation; no forced identical Top 5.
- Review experiment outcomes and rollback losers; preserve comparable holdouts where practical. Count useful indexed entrances, qualified organic sessions and approved funnel events, not just sitemap growth.
- Retire demonstrably low-value published content through existing retention/quality policy, preserving legitimate historical URLs and data. Never fabricate previews or paid campaigns for inventory targets.
- Deliver a 90-day measured country report: complete-window impressions/clicks/CTR, query mix, index/exclusion samples, mobile usability, funnel conversion and costs. Decide further work from evidence; no guaranteed ranking, traffic target or unapproved spend.

## Sources and reproducibility

Google's guidance supports [reciprocal localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [multi-regional site signals](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites), [canonical duplicate handling](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [indexed-version URL inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect) and [truthful Event structured data](https://developers.google.com/search/docs/appearance/structured-data/event). Country and query figures above come from LivaSports' stored authenticated Google measurements; indexing/CWV observations come from the signed-in property UI.

Re-run local gates with `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run secret:scan`. For bounded public verification use the audit command above (or its permitted localhost origin). Do not run ingestion, provider refresh, media generation or sitemap-write commands merely to repeat this audit.
