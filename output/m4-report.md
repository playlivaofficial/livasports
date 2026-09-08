# LivaSports M4 — Final Validation Report

## Overall status

**RELEASE CANDIDATE — production deployment pending final gates**

The Match Center implementation, controlled enrichment, second idempotency run, local route QA, and responsive visual QA are complete. This report will be amended with the final commits and Vercel deployment after production verification.

## Controlled provider usage

- Sportmonks: **29 requests total**
  - documented-shape diagnostics: 8
  - rejected first include probe: 1 (sanitized, job failed before any fixture cursor advance)
  - first successful five-fixture enrichment: 10
  - controlled second/idempotency enrichment: 10
- OddsPapi: **0 requests**
- Full M3.6 ingestion was not repeated.

## Neon state

| Item | Count |
|---|---:|
| Enabled competitions | 34 |
| Seasons | 42 |
| Teams | 1,343 |
| Fixtures / stable public IDs | 904 / 904 |
| Provider mappings | 2,484 |
| Score components | 32 |
| Events | 70 |
| Statistics | 330 |
| Lineups | 174 |
| Formations | 8 |
| Named coaches | 0 |
| Standings | 90 |
| Module states | 30 |

Duplicate counts are zero for competitions, seasons, teams, fixtures, provider mappings, public IDs, scores, events, statistics, lineups, formations, coaches, and standings. Active sync jobs: 0. Stale sync jobs: 0. Relational orphan records: 0. There are 134 intentionally unmaterialized provider identity reservations from M3.6's normalize-before-filter flow; no canonical/product row references them.

## Idempotency and recovery

- Migration `006_m4_match_center.sql`: applied once.
- Migration re-run: `migrationsApplied: []`.
- Successful enrichment jobs: 2, each 5/5 fixtures and 10 requests.
- Second run produced identical row counts and zero duplicates.
- A failed partial/expired job can be reclaimed from its durable fixture cursor; active leases reject overlap.

## Functional result

- Stable/canonical match routes: PASS.
- Wrong slug real HTTP 308: PASS.
- Unknown/malformed ID real HTTP 404: PASS.
- DB error is not converted to 404: PASS by route-guard design/error boundary.
- Scheduled match: PASS (real sample).
- Finished match: PASS (real BR and MX samples).
- Live match: NOT OBSERVED. Development replay is visibly labeled and unavailable in production.
- Events/statistics/lineups/formations: PASS on controlled rich samples.
- Coach names: PARTIAL; none supplied in controlled responses.
- Standings: PASS where applicable; cup table state is N/A.
- Form/H2H: PARTIAL; bounded stored-window history is honest, full backfill not performed.
- Missing/pending/unsupported/error/stale states: PASS.
- PT-BR and ES-MX localization: PASS for observed events and 43 statistic types.
- Normal navigation provider requests: 0.
- Cache cold-to-warm transition: MISS -> SET -> HIT observed for every Match Center module.

## Local browser QA

- 1440 desktop: PASS.
- 768 tablet: PASS.
- 430, 390, 375 mobile: PASS.
- Root horizontal overflow: 0 at every viewport.
- Broken team images: 0 in measured samples.
- M3.6 list navigation: 34 competition sections preserved; fixture rows link to canonical match pages.

Screenshots are stored beside this report with the `m4-` prefix.

## Live refresh

**NOT OPERATIONAL 24/7.** Internal polling and stale detection are implemented, but there is no production upstream scheduler. The current Vercel Hobby cron limitations do not satisfy live cadence. Safe Match Center release is independent of this activation gap.

## Release fields

- Feature branch commit: PENDING
- Main commit: PENDING
- GitHub push: PENDING
- Vercel deployment ID/status: PENDING
- Production QA: PENDING

