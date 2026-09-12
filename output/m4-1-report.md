# LivaSports M4.1 — Final Validation Report

## Overall status

**PASS — RELEASED AND PRODUCTION-VERIFIED**

M4.1 adds production-grade PT-BR/ES-MX team and player profiles, stable canonical identity, Match Center links, fixture-level player statistics, honest partial-data states, SEO discovery, cache/database-only navigation, and disabled-by-default sponsor support. No M5/M6/M7/M8 scope was started.

## Delivered product

- Canonical team routes: `/br/time/...`, `/mx/equipo/...`.
- Canonical player routes: `/br/jogador/...`, `/mx/jugador/...`.
- HTTP 308 stale-slug redirects and genuine HTTP 404 unknown IDs.
- Team headers, fixtures/results, competition contexts, standings, squad groups, and season statistics.
- Player identity, current squad context, biography fields when real, season statistics, and recent match logs.
- Match Center team, lineup, event, standings, and player-performance links.
- Real team/player images with initials fallback.
- Native PT-BR/ES-MX country and player-position labels; unknown provider positions are omitted instead of leaking English.
- Localized missing/partial/not-covered/error/stale states; missing values never become zero.
- Dynamic DB-only team/player sitemap with canonical and `hreflang` pairs; thin lineup-only players remain accessible with `noindex,follow` but are excluded from sitemap discovery.
- Sponsor schema/component/eligibility/event contracts with zero active campaigns and zero empty ad gaps.

## Provider capability evidence

- Six audit teams: Athletico PR, Bahia, América, Fulham, Grêmio, Flamengo.
- Recovery sample: 33-player Flamengo squad and detailed player metadata/statistics.
- Squad endpoint include mismatch: the advertised `detailedPosition` relation was rejected with sanitized provider code `5013`; accepted `player;position` shape is used.
- Team identity, metadata, venue, squad, team stats, player identity, player metadata, season stats, fixture player stats, and Types reference: available with partial per-entity coverage.
- Coach: partial; no verified names in the sample.
- OddsPapi: untouched.

## Request accounting

- Sportmonks capability audit/recovery: 15.
- Sportmonks controlled profile sync: 13 + 13 + 13.
- **Exact Sportmonks M4.1 total: 54.**
- **OddsPapi requests: 0.**
- DB-only linking/verification/navigation: 0 provider requests.

## Final Neon counts

| Item | Count |
|---|---:|
| Canonical teams / team public IDs | 1,343 / 1,343 |
| Canonical players / player mappings | 253 / 253 |
| Squad memberships | 99 |
| Team season statistic rows | 122 |
| Player season statistic rows | 26 |
| Fixture player statistic rows | 131 |
| Linked lineup rows | 174 |
| Linked event rows | 69 |
| Profile module states | 187 |
| Active sponsor campaigns | 0 |
| Active / stale jobs | 0 / 0 |

Controlled team coverage is Flamengo 37 squad/43 stats, América 34/41, and Fulham 28/38. Four detailed players have 26 season-stat rows; 253 canonical players include useful lineup-linked partial profiles. There are 154 missing-photo and 154 missing-DOB player records, all rendered honestly with fallbacks/omitted fields.

## Idempotency and integrity

- Migration `007_m4_1_team_player_profiles.sql`: applied once; re-run applied none.
- Second identical controlled sync: 3/3 targets, 13 requests, inserted 0, updated 238.
- Duplicate team IDs, player IDs, player mappings, squad memberships, team stats, player stats, fixture-player stats: 0.
- M4.1 relational orphans: 0.
- Active/stale profile jobs: 0/0.
- Same-name player groups: 2, intentionally distinct through canonical IDs.
- Current sample players with multiple teams/competitions: 0/0; schema support is present but no unobserved transfer claim is made.

## Local functional and visual QA

- 1440 desktop: Flamengo team and Agustín Rossi player pages PASS.
- 768 tablet: player profile PASS.
- 430 mobile: América team and MX Match Center PASS.
- 390 mobile: Flamengo team, Agustín Rossi, América, Luis Malagón PASS.
- 375 mobile: incomplete Bernardo Schons Zortea profile PASS.
- No page-level horizontal overflow, clipped mobile tabs, broken provider images, or blank sponsor gaps observed.
- Real/partial state, photo/DOB fallback, long names, accents, team/player locale switching, canonical redirects, and genuine 404 were inspected.
- Rich M4 Remo–Flamengo player-performance links and BR/MX lineup/event links work without nested anchors.
- Normal navigation provider requests: 0. Local cache MISS -> SET -> HIT observed.

## M3.6/M4 regression status

- 34/34 competition registry preserved.
- Existing BR/MX list and Match Center routes remain database/cache-first.
- M4 audit remains: 34 competitions, 42 seasons, 1,343 teams, 904 fixtures, 2,484 mappings, 32 score rows, 70 events, 330 match stats, 174 lineups, 8 formations, and 90 standings rows.
- M4 duplicate/product-orphan counts remain zero; its earlier 134 unmaterialized provider identity reservations remain non-product rows and are not relational orphans.

## SEO and sponsor status

- SSR metadata, canonical URLs, PT-BR/ES-MX alternates, real-property JSON-LD, internal links, sitemap eligibility, and thin-player `noindex,follow`: PASS locally.
- Active profile sponsors: 0. All placements are hidden; no affiliate/commercial claim is rendered.

## Profile refresh automation

**NOT OPERATIONAL 24/7.** The bounded, leased, resumable manual worker is operational. The existing hosting setup has no continuously operating profile-refresh scheduler. This does not affect safe database/cache-backed page delivery; a later approved scheduler is required for automatic backfill/refresh.

## Final local release gates

- Node tests: PASS — 6/6.
- Vitest: PASS — 94/94 across 29 files.
- Typecheck: PASS.
- Lint: PASS with zero warnings.
- Next.js 16.3.4 production build: PASS.
- Migration re-run: PASS; `migrationsApplied: []`.
- M4.1 duplicate/orphan/job audit: PASS.
- M4 regression audit: PASS; 34 enabled competitions and zero canonical mapping gaps.
- Local secret scan: PASS; tracked/unignored environment files 0, credential leaks 0, client secret references 0.

## Production release

- Feature branch commit: `2f07b5bdeeaf475874451260fb658fafbe01a38e`.
- Main merge commit: `2881ca2`.
- Production code commit after QA fixes: `0bd5daa35b7a0dc7d6f1a4b27e70a986f6eeb88e`.
- GitHub: feature branch and `main` pushed without force; local code-release HEAD matched `origin/main`.
- Existing Vercel project only: `nikapopkha3-4447s-projects/livasports`.
- Production deployment: `dpl_5QyxzNLhzedcrYC18PyfkgxiYiuw` — READY.
- Production aliases: `https://livasports.com`, `https://www.livasports.com`, and the existing Vercel aliases.

## Production verification

- HTTPS apex, `www` to apex redirect, root locale redirect, `/br`, `/mx`, representative BR/MX team pages, representative BR/MX player pages, a partial player page, representative BR/MX Match Center pages, canonical 308 redirect, real 404, sitemap, and `/api/internal/health`: PASS.
- Rendered PT-BR profile title, position, country/date formatting, canonical URL, PT-BR/ES-MX `hreflang`, `index,follow`, real image, internal links, and zero blank sponsor output: PASS.
- Production profile viewport exposed by the QA browser (1265 px content width): no horizontal overflow and zero broken images. Exact 375/390/430/768/1440 responsive states were already inspected locally on the same compiled CSS before release.
- Production sitemap: eligible Agustín Rossi profile present; thin Bernardo Schons Zortea profile absent. The thin page itself remains available and `noindex,follow`.
- Cache runtime log: MISS -> DEDUPLICATED -> SET -> HIT on a cold profile, followed by repeat HIT. Ordinary profile navigation remains database/cache-only with `providerRequests = 0` by runtime contract and tests.
- Production runtime log capture contained the expected cache diagnostics and no unexpected warning/error for the controlled requests.
- Remote secret scan: PASS — 9 production documents/bundles scanned, credential leaks 0; local tracked/unignored environment files 0, credential leaks 0, and client secret references 0.

## Remaining limitations

- Detailed enrichment remains intentionally bounded to three representative teams and four season-stat players; all other persisted identities show honest partial/unavailable states.
- Coach names were not verified in the controlled provider sample.
- Automatic 24/7 profile refresh is not operational on the current hosting setup; the safe manual leased worker is operational.
- Active sponsor campaigns remain 0, so no sponsored placement is rendered.

M4.1 is complete. No M5/M6/M7/M8 scope was started.
