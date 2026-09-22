# P2 — SEO URL and indexability policy

Single source of truth: `src/seo/policy.ts` (typed `routePolicies`, `competitionCanonical`, `nonSemanticParams`, `robotsDisallow`, `privatePathPrefixes`). Metadata (`src/sports/metadata.ts`, `src/localization/*Page.tsx`, `src/profiles/page.tsx`, `src/match-center/page.tsx`), the primary sitemap (`src/seo/sitemap.ts`), the entity sitemaps (`src/sports/sitemap*.ts`), `src/app/robots.ts`, internal links (`src/sports/CompetitionPanel.tsx`) and the tests (`src/seo/policy.test.ts`, `src/sports/metadata.test.ts`) all read this module. No route keeps a private copy of a rule.

Locales: `pt-BR` (`/br`), `es-MX` (`/mx`), `en` (`/en`). Canonical origin: `https://livasports.com`.

## Route families

| Family | Identity | Semantic params (canonical order) | Indexable | Sitemap | hreflang | robots.txt |
|---|---|---|---|---|---|---|
| home `/{locale}` | upcoming board | — | yes | `/sitemap.xml` | 3 + x-default=en | allow |
| football `/{locale}/futebol\|futbol\|football` | hub across competitions | — | yes | `/sitemap.xml` | yes | allow |
| live, today | live board / today's schedule | — | yes | `/sitemap.xml` | yes | allow |
| competition `…football?competition=<slug>` | **entity** identified by registry slug | `competition`, `tab` (≠fixtures), `season` (≠ default), `p` (>1, in range) | yes when the resolved season/tab has rows | `/sitemap.xml` (default season; only tabs with rows) | yes, same tab/season/page | allow (query URLs are never disallowed) |
| match `/{locale}/jogo\|partido\|match/<slug>-<id16>` | fixture public id (slug cosmetic, 308-corrected) | — | yes; pending draws and **finished matches older than 30 days** (M1 decay) are noindex,follow | `/sports-sitemaps/matches-N.xml`, **kickoff within −30 d … +45 d** (M1) | yes | allow |
| team `/{locale}/…/<slug>-<id16>` | profile public id | — (panel params `matches`,`p`,`season`,`squadSeason` canonicalise to the profile) | `profile.indexable` | `/sports-sitemaps/teams-N.xml` (supported competitions only, M1) | yes | allow |
| player `/{locale}/…/<slug>-<id16>` | profile public id | — (same panel params) | `profile.indexable` | **not submitted (M1)** — still crawlable, linked and indexable on its own merit | yes | allow |
| legal `/{locale}/<document>` | reviewed document | — | yes | `/sitemap.xml` (lastmod = review date) | yes | allow |
| help `/{locale}/<document>` (P2) | evergreen topic | — | yes | `/sitemap.xml` (lastmod = review date) | yes | allow |
| search `…football?q=` | internal search results | `q` | **noindex,follow** | no | no | allow |
| sign-in, account | auth utilities | — | noindex,nofollow (account redirects when signed out) | no | no | allow |
| My Matches | personalised feed | — | noindex,follow | no | no | allow |
| owner preview, /qa | separately authenticated tooling | — | noindex | no | no | **disallow** |
| /api, /go, /language, /time-zone | JSON, affiliate redirects, POST-only prefs | — | n/a | no | no | **disallow** |

Non-semantic parameters (never part of a canonical, never in a sitemap): `date`, `view`, `q`, `matches`, `squadSeason`, `theme`, `ref`, `fbclid`, `gclid`, `msclkid`, `ttclid`, `igshid`, `mc_*`, `utm_*`.

## Canonical rules

* Every indexable response emits exactly one absolute `https://livasports.com` canonical (`metadataBase` in the root layout) on the localized route. PT-BR pages canonicalise to PT-BR.
* Home, Football, Live and Today stay separately indexable: they answer different intents (upcoming 7 days, all views by competition, in-progress, today's date) with different headings and descriptions. Board filters (`date`, `view`, `competition` on home/live/today) canonicalise to the board.
* Competition hubs: `?competition=serie-b-italy` is an entity identity and is preserved. Two competitions never share a canonical. The **default season** (what a request without `?season` resolves to, `CompetitionHub.defaultSeasonId`, computed by `resolveDefaultSeason` in both the hub repository and the sitemap query) is omitted from the canonical; an explicit `season=` equal to it collapses to the parameterless URL; an unknown season id resolves to the default and is dropped.
* Tabs: fixtures (entry), results, standings, scorers and teams are distinct content and self-canonicalise. A tab with zero rows for the resolved season is `noindex,follow` with a self canonical and no hreflang cluster. The fixtures tab counts its "recent results" block, so an off-season hub with history stays indexable.
* Pagination (fixtures/results only): `p=N` within range self-canonicalises (`… · página N` in the title) with crawlable previous/next anchors; `p` beyond the last page is `noindex,follow`. Standings/scorers/teams ignore `p`.
* Historical seasons: metadata names the resolved season (`Brasileirão Série A 2025: resultados`); the visible fallback note ("Exibindo 2025…") is unchanged; a compact crawlable season link list (≤6 seasons with fixtures) sits under the season form.
* Unknown competition slug on the football route → real HTTP 404 (`notFound()`), never a 200 listing. Registry-known slug whose data is missing or whose load failed → 200 with `noindex,follow` and no canonical rewrite (transient failures never re-identify a page).
* Entity slugs are corrected with 308 by `src/proxy.ts`/pages; malformed or unknown ids return 404 HTML with `noindex`. A database outage falls through to the error boundary (500), never a 404.

## hreflang

`languageAlternates()` emits `pt-BR`, `es-MX`, `en` and `x-default` (= the English equivalent of the same page, a deliberate international fallback). Clusters are self-inclusive and reciprocal because every locale computes the same paths from the same entity/tab/season/page. Noindex surfaces (search, auth, My Matches, pending fixtures, empty tabs, out-of-range pages) emit no cluster.

## Sitemaps

* `/sitemap.xml` (`src/app/sitemap.ts` → `primarySitemap`): 4 hubs + 4 legal + 3 help documents + competition hub entries (+ results/standings/scorers/teams tabs that have rows for the default season), each ×3 locales with `xhtml:link` alternates. `lastmod` only where a source date exists (fixture `updated_at` max for the season; document review dates). No `changefreq`/`priority`. Data comes from one bounded two-query summary (`SportsSitemapRepository.competitionSummaries`) cached 1 h (stale-if-error 24 h). If the database fails, competition entries are still listed; only tab detail is withheld.
* `/sports-sitemaps.xml` → `/sports-sitemaps/{matches,teams}-N.xml`: 500 entities × 3 locales = 1,500 URLs per file. Cached 6 h with 24 h stale-if-error; `lastmod` = latest source observation. Entities are **not** repeated in `/sitemap.xml`.
* **M1 submission budget.** Search Console reported ~263k submitted entity URLs with ~248k stuck at "Discovered – currently not indexed", so submission is bounded to inventory that can earn qualified traffic:
  * **players are no longer submitted** (`routePolicies.player.sitemap === false`, `submittedSitemapKinds` excludes them). `/sports-sitemaps/players-N.xml` now answers 404; the profiles themselves are untouched.
  * **matches are bounded to a kickoff window** of −`matchSitemapPastDays` (30) … +`matchSitemapFutureDays` (45) days. The SQL in `sitemap-repository.ts` mirrors `matchSitemapWindow()` exactly, and `isMatchInSitemapWindow()` is the unit-testable form.
  * **competitions and teams need real coverage**, not just a registry `enabled` flag: `c.coverage_status IN (submittableCoverageStatuses)`. A competition whose coverage summary is missing is skipped — unless the summary load failed entirely (`null`), where every registry hub stays listed so a database outage never empties the section.
* **M1 finished-match decay.** `isFinishedMatchDecayed(status, kickoff)` marks a `FINISHED` fixture older than `finishedMatchDecayDays` (30, deliberately the same constant as the sitemap past bound so the two can never disagree) as `noindex,follow` with a self canonical and no hreflang cluster. The route still answers 200 with full content; only index priority is withdrawn. Fixtures that can still be replayed or rescheduled (`POSTPONED`, `CANCELLED`, `ABANDONED`, …) never decay on age. A decayed page also stops repeating the ~30 player links already present in its own lineups, and gains an upcoming-match block (`NextMatches`) so it is not a dead end.
* `validateSitemapUrls()` (unit tests + `scripts/p2-seo-http-qa.ts`) rejects non-absolute URLs, wrong origins, private paths, non-semantic params, wrong parameter order, fragments and duplicates.

## robots.txt

Production (`VERCEL_ENV=production`): `Allow: /`, `Disallow: /api/, /go/, /owner/, /qa/, /language, /time-zone`, both sitemap URLs. No rule touches query strings or locale prefixes. Any other environment: `Disallow: /` plus `<meta name="robots" content="noindex">` from the root layout — the preview rule is keyed on the environment and tested to never apply in production.

## Structured data (`src/seo/structured-data.ts`, `src/sports/match-seo.ts`, profile routes)

Home: `Organization` + `WebSite`. Competition hub: `BreadcrumbList` (Home → Football → Competition [→ Season] [→ Tab]) mirroring the visible hub context. Match: `SportsEvent` + `BreadcrumbList`. Team: `SportsTeam`; player: `Person` (stored facts only). Help/legal: `BreadcrumbList`. Never: ticket `offers`, odds, organizer, ratings, authors, broadcast. One serializer (`src/seo/json-ld.tsx`) escapes `<`, `>`, `&`, U+2028/2029.

**M1 SportsEvent validity.** Google requires `location` on every `SportsEvent`. The previous `venue ? {…} : undefined` shipped items with the key missing whenever a fixture had no stored venue, which is the invalid-Event error Search Console reported. Now `eventLocation()` builds a `Place` from the stored venue, falling back to the stored city as the place name, and **when neither exists the whole `SportsEvent` is omitted** — the healthy `BreadcrumbList` still ships. Nothing is invented to satisfy the schema:

* `eventStatus` maps only to the five members `EventStatusType` actually defines. schema.org has **no completed state**, so a played match keeps `EventScheduled` ("proceeded as scheduled"); `ABANDONED` emits no status at all.
* `endDate` is **not** emitted: the real final whistle is not stored, and estimating it would be fabrication.
* Truthful extras that the fixture does support are included: `description` (the same localized copy as the page metadata), `image` (the page's own Open Graph image), and `performer` (the two teams).

**M1 internal links.** The match breadcrumb and the visible competition link now use the canonical competition URL. They previously appended `?season=<id>` even when that id was the hub's default season, which `competitionCanonical()` drops — so both pointed at a non-canonical twin of the same hub.

## Private data

Metadata, JSON-LD, sitemaps and caches never read the session: My Matches renders its lead copy only; account/sign-in metadata is static; favorites and slips stay in the browser or behind authentication.
