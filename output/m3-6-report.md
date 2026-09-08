# LivaSports M3.6 — Competition Expansion Report

Generated: 2026-09-08T07:00:07.171Z

## Status

**COMPLETE — PRODUCTION-SAFE RELEASE CANDIDATE**

M3.6 expands LivaSports to the final approved 34-entry Sportmonks club-competition set. The updated subscription is recognized, all mappings are exact and unambiguous, the controlled Neon ingestion is complete, and the second idempotency pass created no new records. Production deployment and production smoke results are recorded after the final release gate; M4 has not started.

## Coverage result

- Approved targets: **34**
- `SUPPORTED`: **26**
- `SUPPORTED_BUT_NO_CURRENT_FIXTURES`: **8**
- `NO_SUBSCRIPTION_ACCESS`: **0**
- `NOT_FOUND`: **0**
- `AMBIGUOUS_MAPPING`: **0**
- Coverage-only provider requests: **21**

The exact provider names, IDs, seasons, confidence scores, and controlled-window fixture counts remain in `output/m3-6-coverage-report.md` and `output/m3-6-coverage-report.json`. The previous 10/30 result is obsolete and is not used by M3.6.

## Final Neon state

| Entity | Count |
| --- | ---: |
| Enabled competitions | 34 |
| Seasons | 42 |
| Current seasons | 33 |
| Unique teams | 1,343 |
| Fixtures | 904 |
| Provider mappings | 2,484 |

DB-backed reads are available for both locales. The final read gate returned 24 competitions and 327 fixture rows for each localized route data read, with **0 paid odds/provider requests**.

### Counts by competition

Team counts below are competition-season memberships; the global team count is deduplicated.

| Competition | Coverage | Seasons | Current | Teams | Fixtures |
| --- | --- | ---: | ---: | ---: | ---: |
| Brasileirão Série A | SUPPORTED | 1 | 1 | 20 | 33 |
| Copa do Brasil | SUPPORTED | 1 | 1 | 126 | 4 |
| Copa Libertadores | SUPPORTED | 1 | 1 | 47 | 8 |
| Brasileirão Série B | SUPPORTED | 1 | 1 | 24 | 51 |
| Paulista A1 | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 1 | 0 | 0 |
| Carioca Serie A | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 1 | 0 | 0 |
| Copa do Nordeste | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 1 | 0 | 0 |
| Copa Sudamericana | SUPPORTED | 1 | 1 | 56 | 8 |
| UEFA Champions League | SUPPORTED | 1 | 1 | 81 | 18 |
| Premier League | SUPPORTED | 2 | 1 | 20 | 31 |
| La Liga | SUPPORTED | 2 | 1 | 20 | 42 |
| Serie A (Italy) | SUPPORTED | 2 | 1 | 20 | 32 |
| Bundesliga | SUPPORTED | 2 | 1 | 18 | 27 |
| Ligue 1 | SUPPORTED | 2 | 1 | 18 | 27 |
| UEFA Europa League | SUPPORTED | 1 | 1 | 76 | 18 |
| UEFA Conference League | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 1 | 165 | 0 |
| Liga Portugal | SUPPORTED | 2 | 1 | 18 | 31 |
| Eredivisie | SUPPORTED | 2 | 1 | 18 | 30 |
| Liga Profesional de Fútbol | SUPPORTED | 1 | 1 | 30 | 50 |
| Liga MX | SUPPORTED | 1 | 1 | 18 | 36 |
| Major League Soccer | SUPPORTED | 1 | 1 | 30 | 75 |
| Saudi Pro League | SUPPORTED | 2 | 1 | 18 | 28 |
| CONCACAF Champions Cup | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 1 | 0 | 0 |
| UEFA Super Cup | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 1 | 0 | 0 |
| Championship | SUPPORTED | 1 | 1 | 24 | 59 |
| FA Cup | SUPPORTED | 1 | 1 | 579 | 144 |
| Carabao Cup | SUPPORTED | 1 | 1 | 92 | 16 |
| Ligue 2 | SUPPORTED | 1 | 1 | 18 | 27 |
| Serie B (Italy) | SUPPORTED | 1 | 1 | 20 | 30 |
| Coppa Italia | SUPPORTED | 1 | 1 | 45 | 8 |
| La Liga 2 | SUPPORTED | 1 | 1 | 22 | 44 |
| Copa del Rey | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 1 | 0 | 0 |
| Super Lig | SUPPORTED | 1 | 1 | 18 | 27 |
| Pro League Play-offs | SUPPORTED_BUT_NO_CURRENT_FIXTURES | 1 | 0 | 0 | 0 |

The eight zero-fixture rows are accessible and deliberately classified as no-current-sample, not provider failures. UEFA Conference League returned current teams but no fixtures in the controlled window. The automatically included Saudi play-off entry remains non-priority.

## Resume completion

- Finished the remaining Champions League, Europa League, and Conference League team ingestion.
- Finished the controlled EUROPE/OTHER fixture groups: **391 fixtures inserted**.
- Finished scores ingestion: **50 fixtures updated**.
- Aligned all eight accessible zero-window targets to `SUPPORTED_BUT_NO_CURRENT_FIXTURES` without aborting other targets.
- Added target-scoped stage execution so a resume touches only explicitly selected competitions.
- Added bounded canonical team-country reuse and removed 46 stale orphan country mappings left by the interrupted transaction attempts.
- Added stale-run recovery for abandoned `RUNNING` sync records older than 30 minutes.

The original UEFA team failure was PostgreSQL `23505` on the unique country ISO2 constraint: interrupted imports had provider-country mappings pointing at country IDs whose country rows did not exist. Team ingestion now resolves an existing canonical country by ISO2 and does not create redundant team-level provider-country mappings. Migration `005_m3_6_remove_orphan_country_mappings.sql` safely removed only mappings whose internal country row did not exist.

## Idempotency and integrity

The second controlled verification produced:

| Stage | Inserted | Updated | Provider requests | Result |
| --- | ---: | ---: | ---: | --- |
| Teams: UCL, UEL, Conference | 0 | 465 | 3 | PASS |
| Fixtures: resumed 18-target set | 0 | 391 | 11 | PASS |
| Scores | 0 | 50 | 1 | PASS |

Duplicate/orphan audit:

| Check | Result |
| --- | ---: |
| Competition slug duplicate groups | 0 |
| Season duplicate groups | 0 |
| Team duplicate groups | 0 |
| Fixture duplicate groups | 0 |
| Provider-reference duplicate groups | 0 |
| Internal mapping duplicate groups | 0 |
| Teams without Sportmonks mapping | 0 |
| Fixtures without Sportmonks mapping | 0 |
| Orphan Sportmonks country mappings | 0 |
| Active `RUNNING` ingestion records | 0 |

## Provider request accounting

This continuation consumed exactly **43 Sportmonks requests**, including two one-request diagnostics that isolated the country constraint error and all second-pass verification calls. The earlier checkpoint recorded a confirmed minimum of 164 requests plus one interrupted run whose in-flight team-stage request count was not persisted. No paid provider request was triggered by normal page navigation or the DB read gate.

## Safety and scope

- Existing valid competition, season, team, fixture, and mapping rows were preserved.
- No International Tournaments package competition was added.
- No OddsPapi behavior, UI architecture, or M3 cache boundary was redesigned.
- Provider IDs remain isolated behind mappings; routes use canonical LivaSports slugs.
- Credentials remain server-only and are absent from reports and commit candidates.
- M4 was not started.

## Release gates

| Gate | Result |
| --- | --- |
| Neon migrations | PASS — migrations 001–005 applied; rerun applied 0 |
| DB-backed BR/MX reads | PASS |
| Duplicate/orphan audit | PASS |
| Tests | PASS — 6 Node tests and 60 Vitest tests |
| Typecheck | PASS |
| ESLint | PASS — zero warnings |
| Production build | PASS — Next.js 16.3.4 |
| Secret scan | PASS — 7 loaded secret values checked across 140 commit-candidate text files; 0 literal leaks, 0 tracked sensitive env files, 0 client credential-name matches |
| Production deployment/smoke/cache QA | Pending final release run |

## Final conclusion

The data expansion and persistence work is complete and production-safe pending the final deterministic build, secret, deployment, and production smoke gates. Stop after M3.6; do not begin M4 automatically.
