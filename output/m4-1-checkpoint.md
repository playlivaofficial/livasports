# LivaSports M4.1 — Release Checkpoint

Checkpoint timestamp: 2026-09-12T13:34:36+04:00

## Completed

- Capability audit and two-request recovery completed within the 15-request audit cap.
- Additive migration `007_m4_1_team_player_profiles.sql` applied to Neon and verified idempotent.
- Controlled Flamengo/América/Fulham enrichment completed three times; the final identical run inserted zero rows.
- Canonical teams/players, provider mappings, squads, team/player/fixture statistics, profile states, and M4 player links persisted.
- DB-only linking re-run completed with providerRequests 0.
- Duplicate/orphan/job audit completed with zero M4.1 duplicates, zero M4.1 relational orphans, and no active/stale jobs.
- Team/player routes, canonical redirect/404 guards, cache-first loaders, localized pages, Match Center links, SEO, sitemap, and sponsor boundary implemented.
- Actual desktop/tablet/mobile rendering inspected at 1440, 768, 430, 390, and 375 pixels.
- Sportmonks request accounting fixed at 54; OddsPapi at 0. Do not rerun the live audit or controlled sample without a new evidence gap.

## Current data state

- Teams/public IDs: 1,343 / 1,343.
- Players/mappings: 253 / 253.
- Squad memberships: 99.
- Team/player/fixture statistic rows: 122 / 26 / 131.
- Linked lineups/events: 174 / 69.
- Profile states: 187.
- Active sponsors: 0.
- Active/stale profile jobs: 0 / 0.

## Safe limitations

- Detailed enrichment is intentionally limited to three representative teams and four season-stat players.
- 154 lineup-linked player profiles lack photo and DOB; they use honest partial states and initials fallback.
- Coach names were not verified.
- No observed multi-team transfer case exists in the controlled sample.
- Automatic 24/7 profile refresh is not active.

## Release state

- Branch: `codex/m4-1-team-player-profiles`.
- Base commit: `e2e8b0fdccb65b286e9da8ab1216c6f007fbdda8`.
- No ingestion process is active.
- Final local gates are PASS: Node 6/6, Vitest 90/90, typecheck, lint, production build, migration audit, M4/M4.1 integrity audits, and secret scan.
- Feature commit/push, safe main merge/push, existing-project deployment, and production QA are the remaining operations.

## Resume rule

Do not run `m4.1:sample` or either provider-audit script again. Resume by inspecting the staged secret scan, commit/push the feature branch, merge without force into `main`, deploy only the already-linked LivaSports Vercel project, and run production QA. Stop after M4.1.
