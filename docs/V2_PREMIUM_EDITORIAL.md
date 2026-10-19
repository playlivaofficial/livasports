# LivaSports premium editorial release

This release replaces the rejected V2 football imagery and homepage presentation, and adds a maintainable, database-backed newsroom. Baseline: `628b2d9bc674998ac28226bb68fbbb56a6717eea`. Branch: `fix/v2-premium-editorial`. Independent draft security PR #72 is excluded.

## Product and runtime boundaries

The homepage now follows header → authentic photographic hero → nine leagues → featured news → filtered news feed → analysis → four tools → eligible inactive commercial slots → footer. Light remains the default; dark preference persists. EN, PT-BR and Spanish content support all five existing route sets.

No sports provider, live odds, scheduler, cron or media-generation job is reactivated. News reads are cached for one hour and invalidated on publication. The Owner newsroom uses the existing separate signed Owner session; ordinary account authentication and historical records are unchanged. All six commercial slots remain inactive. Language/edition selection does not grant commercial GEO eligibility.

## Photography inventory

All photographs are local WebP assets at 640, 1280 and 1920 pixels wide. Width/height preserve the source aspect ratio; cards crop with `object-fit: cover`, while captions identify archive context. No runtime hotlink or AI-generated football photograph remains in active public components.

| Asset prefix | Actual subject and use | Creator and source | Rights and attribution |
| --- | --- | --- | --- |
| `public/editorial/old-trafford` | Archive football match and spectators at Old Trafford, Manchester; homepage hero, not a LATAM match or current event | [Samuel Regan-Asante / Unsplash](https://unsplash.com/photos/people-watching-football-game-during-nighttime-abV5LdRGo_k) | [Unsplash license](https://unsplash.com/license); commercial website use and resizing permitted. Public credit included. Source publication January 9, 2021 is not asserted as capture date. |
| `public/editorial/azteca` | Empty stands and pitch at Estadio Azteca, Mexico City; Mexico stadium retrospective | [Guido Coppa / Unsplash](https://unsplash.com/photos/people-watching-football-game-during-daytime-cakwIZDHvqE) | Unsplash license; public credit included. Source published May 26, 2020; never presented as a 2026 event photograph. |
| `public/editorial/campin` | El Campín stadium and cloudy Bogotá sky; contextual Colombia coverage | [Melissa García / Pexels](https://www.pexels.com/photo/stadium-estadio-nemesio-camacho-el-campin-in-bogota-colombia-12653301/) | [Pexels license](https://www.pexels.com/license/); commercial website use and resizing permitted. Public credit included; no claim that this depicts the reported matchday. |

License review date: October 19, 2026. Stock licenses are not endorsements by clubs, players or photographers. Do not redistribute these as standalone stock, imply endorsement or use them outside their contextual subject. News agency photographs from the linked official articles were not copied.

Removed assets: `public/v2/football-hero-640.webp` and `public/v2/football-hero-1440.webp`, the prior AI football concept. Git history retains recovery copies. The existing owned LivaSports brand Open Graph graphic remains; it is not a news photograph. Original code-native tactical diagrams and four distinct tool previews replace unrelated football filler.

## League identity inventory

The nine navigation identities are accurate **typographic fallbacks, not official logo reproductions**. No reusable commercial logo permission was established; official-site presence alone is not a license. Do not substitute flags, invented crests or unlicensed badges.

| Competition | Official identity source | Current treatment |
| --- | --- | --- |
| Liga MX | [Liga MX](https://ligamx.net/) | Correct name, fixed-size typography |
| Liga BetPlay / Colombian Primera A | [DIMAYOR](https://www.dimayor.com.co/) | Liga BetPlay typography |
| Liga1 Perú | [Liga1](https://liga1.pe/) | Liga1 Perú typography |
| UEFA Champions League | [UEFA](https://www.uefa.com/uefachampionsleague/) | Full competition name |
| CONMEBOL Libertadores | [CONMEBOL](https://www.conmebol.com/conmebol-libertadores/) | Copa Libertadores typography |
| Premier League | [Premier League](https://www.premierleague.com/) | Correct name |
| LaLiga | [LaLiga](https://www.laliga.com/) | Current spelling |
| Serie A | [Lega Serie A](https://www.legaseriea.it/) | Correct name |
| Bundesliga | [Bundesliga](https://www.bundesliga.com/en/bundesliga) | Correct name |

All nine link to real localized league guides. Containers, contrast and accessible names are shared; there are no stretched or missing logo images. Licensed official artwork can replace a fallback only after its rights are recorded.

## Initial news collection and sources

The collection contains short original summaries, not republished source articles. Every story has EN/ES/PT copy, a source link, source date, country/topic and separate actual LivaSports publication/review dates. Initial sources were checked October 19, 2026.

| Story slug | Source date | Primary article |
| --- | --- | --- |
| `cruz-azul-juarez-apertura-2026` | 2026-10-18 | [Liga MX: Cruz Azul 5–0 Juárez](https://ligamx.net/cancha/detallenoticia/48061/victoria-de-la-maquina-contra-juarez) |
| `luis-diaz-triplete-leipzig` | 2026-10-18 | [Bundesliga: Díaz hat-trick against Leipzig](https://www.bundesliga.com/en/bundesliga/news/luis-diaz-back-to-best-bayern-munich-hat-trick-leipzig-39616) |
| `liga-betplay-jornada-15-television` | 2026-10-17 | [DIMAYOR: matchday 15 television notice](https://www.dimayor.com.co/2026/10/17/asi-se-jugara-la-fecha-15-de-la-liga-betplay-dimayor-ii-2026/) |
| `mexico-futbol-amateur-comite-2026` | 2026-10-17 | [FMF: amateur committee election](https://fmf.mx/noticia/el-sector-amateur-de-la-fmf-elige-por-unanimidad-a-su-nuevo-comite-directivo_2303) |
| `colombia-libertadores-femenina-2026` | 2026-10-16 | [DIMAYOR: Santa Fe and Deportivo Cali](https://www.dimayor.com.co/2026/10/16/santa-fe-y-deportivo-cali-buscaran-hacer-historia-en-la-conmebol-libertadores-femenina-2026/) |
| `champions-league-october-14-roundup` | 2026-10-14 | [UEFA: Wednesday round-up](https://www.uefa.com/uefachampionsleague/news/02aa-21d3f8c574f1-e140f41454d4-1000--champions-league-round-up-real-madrid-and-paris-headline-r/) |
| `sporting-cristal-cajamarca-clausura` | 2026-10-12 | [Liga1: Sporting Cristal at UTC](https://liga1.pe/sporting-cristal-gano-en-cajamarca-y-es-nuevo-lider-del-clausura-por-diferencia-de-goles/) |
| `peru-puerto-pizarro-fifa-arena` | 2026-08-27 | [FIFA: Puerto Pizarro mini-pitch](https://inside.fifa.com/advancing-football/news/peru-mini-pitch-puerto-pizarro-agustin-lozano-infantino) |
| `azteca-tres-mundiales` | 2026-07-06 | [FIFA: Azteca's three World Cups](https://inside.fifa.com/organisation/news/mexico-city-stadium-azteca-world-cup-26-maradona-pele-sanchez) |

The older Peru and Azteca items are explicitly dated background stories, not newly occurring news. Source publication dates are not rewritten on ingestion. LivaSports first-publication timestamps reflect actual publication; unchanged republication does not change `updatedAt`.

## Keeping news current

Use **Owner operations → Newsroom** (`/owner/news`). The existing Owner key and session remain separate from account login.

1. Open a primary official announcement and verify facts, date and context. The newsroom lists approved official domains. No RSS feed has been approved for syndication; no polling or automated news writer runs.
2. Create a stable slug and original concise headline, summary and body in EN, ES and PT. Save incomplete drafts privately as needed. Source URLs must be clean HTTPS article URLs on the approved list.
3. Choose no photograph unless an existing rights-reviewed image is genuinely relevant. Use an accurate archive caption in all languages. New photographs require a separately reviewed asset-code change; ordinary news publishing does not.
4. Preview each language. Check the source, wording, date, translations and image rights, then select **Record source review**.
5. Select **Publish reviewed version** within 24 hours. Public home/news/article pages and sitemap invalidate immediately, without an application rebuild. Source review is human work; field validators are not a fact-checking service.
6. To correct a published story, save changes privately, review the new revision, then publish. The previous public snapshot remains visible until publication. Concurrent edits fail with a revision conflict instead of overwriting newer work.
7. **Unpublish** hides the story publicly but preserves its draft, prior snapshot and audit history. It does not delete user or historical sports data.

An editor must replenish the collection regularly. The heading is “Latest news” only when both a visible story's source date and verification are less than seven days old; otherwise it becomes “News and analysis.” Filtering recalculates that heading. Republishing old material cannot manufacture freshness. Cached headings may take up to one hour to age out without a new publication.

## Storage and release operations

Migration `072_v2_editorial_newsroom.sql` adds only `editorial_news` and `editorial_news_audit` plus their indexes. It is idempotent and preserves every existing table. Writes are transactional, revision-checked, rate-bounded, Owner-authenticated and same-origin. Public queries only return non-archived published snapshots; private API responses are no-store/noindex. Plain text is escaped; arbitrary HTML, remote image URLs and unapproved source hosts are rejected.

`scripts/v2-newsroom-release.ts` provides bounded `audit`, `verify`, `migrate` and `seed --publish-reviewed` operations. Load only the existing database credential into process memory. Never export credentials into logs or docs. Migration refuses unrelated pending files. `verify` exercises the real repository against transaction-local temporary tables. `seed` skips existing slugs, never overwrites Owner work and refuses unattended reuse after its source-verification deadline. It is a release helper, not a scheduler.

Production requires the existing database. Local/CI runs without a DB can display the same reviewed collection; production never substitutes seed content for a failed database or resurrects unpublished stories. News listings expose up to 120 current items; the sitemap supports 5,000 published items. Review pagination requirements before the collection exceeds those bounds.

## Verification and rollback

Local gates: 17 Node tests plus 3,230 Vitest tests, lint, production build, typecheck, secret scan and a 230-page SEO crawl. The new tests cover draft isolation, review gates, publication dates, concurrent writes, idempotency, soft unpublication, safe sources, cache invalidation, localized links and additive migration. Browser evidence is retained in ignored `output/v2-qa/premium/`; final hosted CI, deployment and production evidence belongs in the release PR.

Migration 072 was applied successfully on October 19, 2026; a repeat applied nothing. The real SQL repository passed transaction-local draft isolation, review, concurrency, idempotency and archive checks. Initial publication created nine stories; the second seed run created zero and skipped all nine. Authenticated browser QA saved a featured-placement change privately, confirmed the old public snapshot remained, then reviewed/published and observed the changed server-rendered homepage without rebuilding. The original featured placement was restored through the same review flow. These checks altered only this release's newly created editorial records.

Restore the verified baseline deployment or revert this PR through the normal reviewed workflow if production fails acceptance. Keep the two additive tables and editorial history; do not drop them, wipe the DB, reset main or restore pre-V2 paid jobs. The initial nine publications can be unpublished individually from Owner if editorial corrections are needed.

Limitations: no official logo license is claimed; there is no autonomous news acquisition; physical handset testing and post-release field Core Web Vitals are not replaced by desktop viewport checks. No search ranking or traffic increase is asserted by this release.
