# LivaSports M4.1 — Release Checkpoint

Checkpoint timestamp: 2026-09-12T14:19:02+04:00

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

- Status: **COMPLETE — PRODUCTION-VERIFIED**.
- Feature commit: `2f07b5bdeeaf475874451260fb658fafbe01a38e`; pushed to `origin/codex/m4-1-team-player-profiles`.
- Main merge: `2881ca2`; final production code commit: `0bd5daa35b7a0dc7d6f1a4b27e70a986f6eeb88e`.
- Production deployment: `dpl_5QyxzNLhzedcrYC18PyfkgxiYiuw` in the existing `nikapopkha3-4447s-projects/livasports` project; status READY.
- No ingestion process is active.
- Final local gates are PASS: Node 6/6, Vitest 94/94, typecheck, lint, production build, idempotent migration, M4/M4.1 integrity audits, and secret scan.
- Production routes, canonical redirects/404, HTTPS/`www`, BR/MX profiles and matches, sitemap eligibility, cache MISS/SET/HIT behavior, provider-free navigation, and remote secret scan are PASS.
- The release QA caught and fixed duplicate metadata branding, untranslated provider position labels, and thin-player sitemap eligibility before final sign-off.

## Stop rule

M4.1 is complete. Do not run `m4.1:sample` or either provider-audit script again without a new approved evidence gap. Do not start M5/M6/M7/M8 automatically.
