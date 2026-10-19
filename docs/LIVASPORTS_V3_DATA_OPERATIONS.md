# LivaSports V3 data operations

This is the release runbook, not an activation record. Adding configuration does not establish that a migration ran, a snapshot was published, or automation was enabled. Production migration, environment changes and deployment require separate approval.

## Current release evidence — 19 October 2026

Delivery is limited to a **draft PR for review**. This work has not deployed the application, applied a production migration, imported or published production sports/news data, activated automatic publication, purchased a provider, or changed production credentials. Code and local previews are not operational coverage.

Exactly **three additional authorized Wikimedia requests** were made after the initial research allowance: one fixed-title Action API batch each for Liga MX (one page), NFL (eight division pages) and MLB (six division pages), all on 19 October. No retry or fourth request was made under that allowance. MLB's parser repair was verified by replaying its retained response offline, not by another source request. This count is the additional allowance, not the total earlier research traffic.

Only the following three normalized source artifacts are retained and available to the local sports preview. Matching `*-wikimedia-raw.json` files preserve the acquired responses in the same ignored directory.

| Retained local artifact under `output/v3-source-audit/` | Actual content | Source-date meaning |
| --- | --- | --- |
| `liga-mx-wikimedia-normalized.json` | Apertura 2026: 18 teams, one table, 18 rows | Explicit data date `2026-10-18`; not live/current by virtue of retrieval |
| `nfl-wikimedia-normalized.json` | 2026: 32 teams, eight division tables, 32 rows | Oldest contributing revision `2026-10-18T20:11:21Z`; result cutoff unconfirmed |
| `mlb-wikimedia-normalized.json` | 2026 completed regular season: 30 teams, six division tables, 30 rows; historical mode | Oldest contributing revision `2026-09-27T21:47:13Z`; not a result cutoff or postseason table |

All three have **zero events** and remain unpublished: 80 factual table rows across 15 tables, not complete coverage of all seven sports. EuroLeague/ATP/WTA had earlier successful normalized canaries but no retained normalized artifact; NHL/UFC have raw-source evidence and offline parser fixes, not successful full normalized canaries. NBA has no approved/retained collector snapshot. Do not reconstruct missing source data from summaries or imply that a registered adapter has a published dataset.

The strict preview gate requires `V3_LOCAL_DATA_PREVIEW=true`, `NODE_ENV=development`, and absence of every hosting/database marker checked in `src/multisport/local-preview.ts` (`VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `DATABASE_URL`, `DATABASE_POSTGRES_URL`, `POSTGRES_URL`). It reads only the three fixed, bounded, validated artifact files; arbitrary paths, symlinks, malformed data and unapproved editions fail closed. The UI displays an unpublished local-review banner. Production/test/hosted environments cannot enable this preview. Public snapshot downloads remain DB-publication-only; preview pages hide their download action while retaining source, licence and revision attribution. No page navigation contacts upstream sources.

`src/editorial/v3-seed.ts` contains **seven prepared, unpublished research briefs**, separate from the existing nine-story editorial preview collection. The authenticated Owner newsroom can load a brief into the editor only; this does not create a stored draft, review, publication, or database write. Facts, dates, EN/ES/PT translations and photograph context still require the ordinary save/review/publish workflow. The seven cover Mexico/Colombia/Peru football, NBA, NFL, UFC and WTA; they do not establish news coverage for every sport. The existing nine-story collection is also restricted to the explicit local preview gate, never a missing-storage production fallback.

Typecheck has now passed after generated route types were regenerated; the earlier generated-type blocker is resolved. The final `npm test` run passed **3,712 tests: 17 Node tests plus 3,695 Vitest tests across 330 Vitest files, with zero failures**. Full lint and the unchanged local secret scan also pass. These are local checks, not live PostgreSQL execution or production acceptance.

## Local QA evidence and limits

| Check | Verified local result |
| --- | --- |
| Build | PASS; 619 generated pages. The build still reports 11 pre-existing `metadataBase` warnings on error roots; this is not a warning-free build. |
| Typecheck / lint / secret scan / diff | PASS. Full lint reports no errors or warnings; unchanged secret scan reports zero environment-path, credential-value and client-secret-reference findings. |
| Final loopback SEO crawl | PASS after preview-indexability and legacy-redirect corrections: 271 local requests, 170 XML pages validated, 170 HTML pages checked, zero findings, zero provider requests by the crawler. Legacy URLs resolve directly to canonical destinations. `scripts/v2-route-check.ts` is the checker; these are local, not production observations. |
| Responsive browser checks | Home and Liga MX checked at 320, 360, 375, 390, 430, 768, 1024 and 1440 pixels: page overflow zero at all widths. The 18-row table scrolls inside its own container on narrow screens. |
| Browser flows | EN/ES/PT selection, dark/light theme persistence, source attribution, stale-date labels, unavailable data states and search checked locally. The NBA search defect was corrected and rechecked. |
| Full test suite | PASS: `npm test`, 17 Node + 3,695 Vitest = 3,712 tests; 330 Vitest files; zero failures. |

Retained browser evidence is under ignored `output/v3-qa/`. Measurements: `responsive-observations.json`. Representative screenshots: `home-en-light-320.png`, `home-en-light-768.png`, `desktop-en-light.png`, `mobile-en-light-final.png`, `mobile-es-light-final.png`, `mobile-es-dark-final.png`, `mobile-pt-light.png`, `mobile-pt-dark.png`, `desktop-es-dark-final.png`, `mobile-language-menu.png`, `liga-mx-mobile-es-dark-final.png`, `liga-mx-desktop-dark-final.png`, `nfl-mobile-dark.png`, `mlb-mobile-dark.png`, `nba-mobile-light-final.png`, `atp-mobile-dark-unavailable.png`, `ufc-mobile-dark-unavailable.png`, `search-nba-mobile.png` and `story-mobile-dark.png`. Screenshots document the local state at capture, not a publication or source refresh.

Limits: no production QA or deployment; no live-database migration, real Owner sign-in, saved-review-publication cycle, or account/session mutation was performed. An isolated local PostgreSQL execution environment was unavailable: neither `psql` nor `postgres` was installed; Docker CLI existed but its daemon was unavailable. No service start or installation was attempted. Migration 073 remains **static-audited only and not applied**. Owner/security behavior and additive migration shape have offline regression coverage only. The zero-provider crawl count does not erase separately authorized earlier research requests. An intentionally unavailable no-database auth session is not proof that configured authentication has been exercised end-to-end. Production storage, authentication and publication acceptance remain separate authorized checks.

## Approved paths

| Path | Scope | Publication |
| --- | --- | --- |
| OpenLigaDB | Bundesliga, `bl1/2026`, canonical season `2026/27` only | Strictly reconciled automatic snapshots when explicitly enabled |
| OpenFootball | Premier League, LaLiga, Serie A and Ligue 1, exact audited `2026-27/*.1.json` files | Manual Owner import, review, then publish; historical results only |
| Wikimedia | Fixed audited English Wikipedia table pages in `wikimedia-datasets.ts`; per-page revision provenance required | Manual preview, Owner review and publication only; never automatic or claimed official/live |
| Other competitions | Source catalog/research status only until independently approved | No invented rows, unaudited data, logos or provider access |

Production pages and all public snapshot exports read stored publications; the explicitly gated local page-only preview is described above. They never request provider data. Existing paid sports adapters, odds refresh, media rendering and other retired jobs remain prohibited by `src/v2/runtime-boundary.test.ts`.

## Daily operation and hard limits

The sole deployment cron is `/api/internal/editorial/sports-refresh`, scheduled once daily at `17 7 * * *` (07:17 UTC). The route requires the server-only `CRON_SECRET` bearer value, then `V3_OPENLIGA_AUTOMATION_ENABLED=true`. Missing/invalid authentication returns 401; the disabled flag returns zero requests. Do not copy secrets into commands, logs, URLs, client bundles or this guide.

Vercel includes cron scheduling in its plans, but ordinary function usage still applies. Hobby scheduling is daily with hour-level timing; do not promise exact minute delivery. Delivery can be missed or duplicated, so the database gate, not the scheduler, enforces the budget. See [cron pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [delivery/security behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

OpenLigaDB execution:

1. A short PostgreSQL advisory lock reserves a durable lease and next-allowed timestamp **before** HTTP. Minimum spacing is six hours plus zero-to-five minutes of stored jitter. A crash cannot immediately reopen the gate. The daily schedule itself is not randomly delayed.
2. Request `getlastchangedate/bl1/2026`. An unchanged opaque marker costs one request; it does not refresh source age.
3. Only on change, request the table and all matches. Maximum three requests per eligible run, no redirects and no immediate retries. Each response is limited to 2 MiB and 12 seconds; the route budget is 60 seconds.
4. Require 18 unique teams, 306 unique home/away fixtures, valid final scores and exact agreement of every table total with completed matches. Unknown deductions, missing results and conflicts fail closed. No graphics fields are copied.
5. Commit publication and audit atomically only after validation. A failure retains the previous publication. Archived coverage remains hidden. Persistent failure spacing grows from six to 48 hours.

The default daily cron therefore costs at most three upstream requests per day (at most 93 in a 31-day month), normally one when unchanged. Additional authorized manual invocations share the six-hour gate: at most four eligible runs/12 upstream requests in any half-open 24-hour window, before jitter/backoff reductions. This is an application hard bound, not a provider quota entitlement. Repeated rejected requests can still incur hosting/database cost; protect the cron secret.

OpenLigaDB is a free public-data route, not an uptime or correctness SLA. PostgreSQL storage, functions, bandwidth and logs remain hosting costs. Do not enable a paid provider or increase frequency to compensate for missing coverage. The fixed season stops at `2027-06-02T00:00:00Z`; a separately audited catalog/code update is required for another edition. [OpenLigaDB usage terms](https://beta.openligadb.de/nutzungsbedingungen) require restrained polling and change checks. All collectors identify themselves as `LivaSports-DataCollector/3.0 (+https://livasports.com)`.

## Freshness and truthful dates

The shared default freshness threshold is 24 hours from source observation, not retrieval. Old automatic snapshots remain visibly stale; a successful fetch never makes old results current. Bundesliga observation conservatively records the latest completed match's UTC kickoff, because the source change marker lacks an independently verified timezone. This is **data through that match's start**, not a claim that the match ended at that instant.

Historical OpenFootball snapshots preserve `observedAt: YYYY-MM-DD`, `event.date: YYYY-MM-DD` and `event.start: null`. Do not display an invented midnight kickoff or append UTC time to a date-only value. Local times in the source are ignored without verified timezone semantics. Historical mode remains historical regardless of recent retrieval.

Every displayed table now carries a compact source-age/date warning above its rows, not only in the source panel below. Stale, historical, unconfirmed and invalid dates remain distinct. Known generated headings are localized at render time without rewriting source data or proper participant names. Optional statistics display only when present; missing values are not zero-filled.

## Manual archive import

`scripts/v3-import-openfootball.ts` is a preview collector, not a database writer. It permits exactly four fixed source URLs, one request each, at most 1 MiB/12 seconds each, no retries, polling or arbitrary URLs. The default prints summaries; `--json` prints validated snapshots. It does not load environment files, write files or contact PostgreSQL.

The audited cutoff is September 20, 2026. The real preview on October 19 returned 50 Premier League, 69 LaLiga, 50 Serie A and 45 Ligue 1 results (214 total). It excludes all unscored/future fixtures and never derives standings. Exact source-byte hashes are included in each summary; retain them with editorial acquisition evidence. A later upstream update does not silently extend this audit cutoff.

After approved acquisition, an authenticated Owner imports an individual snapshot, checks source/edition/rights and dates, explicitly reviews the current revision, then publishes it. Edits invalidate review but leave the previous public version intact. Review expires after 24 hours. Duplicate content hashes do not create new revisions merely because retrieval time changed. Optimistic revisions reject stale edits. Manual mode does not bypass the approved source, exact dataset URL, season or schema restrictions. [OpenFootball's CC0 notice](https://github.com/openfootball/football.json/blob/master/LICENSE.md) does not clear third-party trademarks or promise data accuracy.

## Wikimedia manual tables

`scripts/v3-import-wikimedia.ts <competitionId> [--json]` previews exactly one registered dataset. Its single official MediaWiki Action API query batches the fixed contributing page titles with `maxlag=5`. Each response is bounded to 1 MiB and 12 seconds; redirects and automatic retries are disabled. It prints a summary or validated snapshot to stdout and does not load credentials, write files, contact PostgreSQL, publish, or add a scheduler. Public navigation never calls it. The collector cannot fetch arbitrary URLs or silently expand to another season/page.

The registry covers Liga MX, NFL, MLB regular-season history, NHL, EuroLeague, ATP singles rankings, WTA singles rankings and UFC Meta weight-class rankings. Registration is not evidence of successful live collector validation or publication; record that separately in release QA. NBA and other unregistered competitions are not covered by these adapters. Fixed collectors require their expected complete source sections; all imported rows must pass sport/schema, duplicate and arithmetic checks. Owner review still establishes factual correctness and completeness. ATP/WTA competition IDs cannot swap tours or substitute race/doubles rankings; the reviewed UFC source cannot substitute media or pound-for-pound rankings. No fixtures/results or tournament seeds are inferred from standings/rankings. MLB run totals are absent at source and remain omitted, never zero-filled; its regular-season table stays historical, not a postseason table.

Preserve `provenance` for every contributing page, including its exact title, revision ID, revision timestamp and a real `dataAsOf` only if the page explicitly supplies one. The `data-date` basis preserves a date-only sports cutoff. The `source-revision` basis uses the oldest contributing edit timestamp and must display **unconfirmed freshness**: an edit can be cosmetic and does not prove a result cutoff. Main-article revisions cannot substitute for separately transcluded table revisions. Owner review must check edition, completeness, sanctions, tie-break order, dates and suspicious community edits before publication.

No Wikimedia API key or paid subscription is required for these tested public read endpoints. The free service has no guaranteed accuracy or uptime. [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette) requires an identifying User-Agent, caching, restrained serialized requests and appropriate backoff; [current rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) are changeable ceilings, not a recommended polling frequency. On 429, 503, maxlag or other failures, stop and preserve the old publication; respect Retry-After before a separately authorized retry. The initial research request budget is separate from implementation capability and must not be exceeded to run release canaries.

Wikipedia text is reusable commercially under [Wikimedia Terms of Use section 7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use) with applicable [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) obligations. Label the source as Wikipedia contributors, link every reused page/revision (history supplies author attribution), link the licence, identify normalization/derived calculations, and retain share-alike terms for the adapted source content and its machine-readable export. Do not imply official league or Wikimedia endorsement. This is not blanket clearance for third-party media or marks: omit logos, photos, image URLs and article prose. Community-maintained data has no official accuracy guarantee; source-specific notices or uncertain upstream rights still require review.

## Attribution and downloadable data

Keep visible source attribution and a licence link next to every table/result collection. OpenLigaDB data uses ODbL 1.0, not CC0. Maintain an unrestricted, free machine-readable copy of the normalized published dataset through `/api/public/sports/snapshots/bundesliga?season=2026%2F27`, including provenance and licence metadata. Do not put this export behind an Owner login or add terms that restrict ODbL reuse.

ODbL sections 4.2–4.4 require the relevant notices and share-alike treatment of publicly used derivative databases; section 4.6 requires a machine-readable database or the complete changes/method. Treat the published normalized OpenLigaDB snapshot as ODbL-covered, preserve its notices, and offer the corresponding full data. This does not automatically license unrelated editorial text, account data or application code. See the [licence text](https://opendatacommons.org/licenses/odbl/1-0/) and [OpenLigaDB licence](https://beta.openligadb.de/lizenz).

OpenFootball factual-data exports carry their CC0 source notice. Neither route grants club/federation badges, photographs or endorsement rights; use neutral initials/text. A public website or free endpoint is not by itself commercial permission. Unknown-rights sources stay blocked, including manual copies.

## Separately licensed archive photographs

The three newly reviewed archive photographs below are separate from sports-data licences. Their current provenance is recorded in `src/editorial/assets.ts`; `scripts/v3-editorial-assets.mjs` is a one-off preparation utility, not runtime fetching. Nine local WebP files exist: 640, 1280 and 1920-pixel variants for each asset. Do not rerun acquisition without appropriate authorization.

| Local asset | Archive context and attribution | Source and licence |
| --- | --- | --- |
| `ufc-octagon` | UFC octagon/arena archive, uploaded 2007; Lee Brimelow | [Commons file](https://commons.wikimedia.org/wiki/File:UFCOctagon.jpg), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `basketball-arena` | Target Center warm-ups, Minneapolis, 23 January 2008; Bobak Ha’Eri | [Commons file](https://commons.wikimedia.org/wiki/File:012308-TC-Twolves001.jpg), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `tennis-court` | Wimbledon Centre Court aerial archive, 9 September 2023; Arne Müseler / arne-mueseler.com | [Commons file](https://commons.wikimedia.org/wiki/File:Uk_london_Centre_Court_Wimbledon.jpg), [CC BY-SA 3.0 DE](https://creativecommons.org/licenses/by-sa/3.0/de/deed.de) |

Visible credits link the original file and its exact licence and disclose resizing/WebP conversion/display cropping. Preserve applicable attribution/share-alike terms. Captions and alt text identify the archive context: these images do not purport to depict a recent news event. Their licences do not grant official affiliation, logos or unrelated media rights. Existing Azteca, El Campín and Old Trafford assets retain their separate provenance; no additional imagery rights follow from this table.

## Migration and release checklist

Migration `073_v3_sports_snapshots.sql` adds only three new tables and three indexes using `CREATE ... IF NOT EXISTS`, enclosed in a transaction. It does not modify existing tables or insert/delete data. Static tests verify this scope and repeatable DDL. This is **not** a live PostgreSQL execution test: `IF NOT EXISTS` tolerates existing objects but does not repair a divergent existing schema. Inspect any pre-existing same-named objects and verify the migration in an isolated approved database before production execution.

Before activation, verify the schema, source licence/export, schema validators, preview data, draft/review/publication/archival behavior and unauthorized route responses. Ensure only the reviewed data—not test fixtures—is stored. Confirm local/unit tests, then obtain approval for migration, environment change and deployment. `.env.example` remains false; no production secret or enabled flag is committed.

After activation, inspect refresh status (`lastAttemptAt`, `lastSuccessAt`, `nextAllowedAt`, sanitized error/failure count) from Owner. A fresh fetch is not proof of fresh sport data. Inspect publication source dates and at least one public export. Do not clear the persistent gate to force retries. Investigate repeated failure with the previous snapshot still visible and clearly stale.

## Rollback without deleting history

First disable `V3_OPENLIGA_AUTOMATION_ENABLED` through the approved deployment process. Archive an incorrect publication through Owner; retain its record and audit history. To restore a known-good version, retrieve the prior audit snapshot into a new draft, validate and review it, then publish through the normal workflow. Never truncate snapshot/audit tables, delete account data or rewrite source timestamps to hide a failure.

Application rollback must include scheduler configuration review: the previous deployment's cron definitions can return. Keep migration 073 in place for compatibility; it is additive. Verify that archived data disappears from both pages and the public export, including caches. If any public cache still serves a withdrawn dataset, purge that route or disable its caching before considering withdrawal complete.
