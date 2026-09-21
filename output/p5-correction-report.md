# P5 comparison correction — 2026-09-21

## Scope and safety

Based on main `f81c52759b5540dad6d240940e7e7035095b4a4f`; origin was fetched before work and again before release. No newer main changes were present. This correction does not change quota pacing, backoff, deduplication, subscriptions, migration 029, affiliate destinations, freshness windows, or fallback math.

Public logos, listing/Match Center labels, and slip cards no longer expose fallback source descriptions. Internal source IDs, quote IDs, observation timestamps, REAL/PROXY classification, and analytics remain intact. The existing approximation mark remains. Fallback order is unchanged: own fresh REAL → fresh Betano → eligible alternate fresh REAL → unavailable. Betano is never a fourth public card.

## Native coverage audit and repair

Zero provider requests. Inspected cached raw four-tournament canaries and ten latest saved normalized snapshots across tournament IDs 155, 242, 27464, 390, and 54. Exact provider identities are `sportingbet.bet.br` and `betboo.bet.br`.

Observed before at 09:35 UTC and after at 09:45 UTC, against the same 58 upcoming fixtures in the seven-day window:

| Native coverage | Before | After |
| --- | ---: | ---: |
| Sportingbet: any usable native market | 26 | 27 |
| Sportingbet: complete 1X2 | 16 | 16 |
| Sportingbet: totals 2.5 / BTTS | 26 / 26 | 27 / 27 |
| betboo: any usable native market | 30 | 32 |
| betboo: complete 1X2 / totals 2.5 / BTTS | 30 / 30 / 30 | 32 / 32 / 32 |

### Application defects fixed

Two contextual aliases were missing: Goiás–Atlético GO (provider `Goias EC GO` / `AC Goianiense GO`, tournament 390, 2026-09-26 21:30 UTC) and Ceuta–Real Sociedad II (`AD Ceuta` / `Real Sociedad San Sebastian B`, tournament 54, 2026-09-26 12:00 UTC). Canonical competitions, ordered teams, and kickoff times agree exactly. Added competition-scoped aliases only; no fuzzy matching, timestamp shift, tolerance change, fixture duplication, or URL changes.

Replayed only those two fixtures from four saved snapshots under the existing worker lease. Added 22 quotes (betboo 14, Sportingbet 8), preserving original observation times. Four Sportingbet Goiás quotes remain suspended. Second replay: zero current writes, history changes, or closures. Integrity afterward: 34 enabled competitions, 43,397 fixtures, 6,258 odds rows, zero duplicate/orphan odds rows, no active job.

### Genuine limitations retained

Sportingbet's saved Série B raw responses omit market 101 (1X2), while returning totals/BTTS. The Argentina Aldosivi snapshot similarly contains four totals/BTTS quotes but no 1X2. These mapped quotes are persisted and eligible; the 1X2 resolver correctly uses fallback. Some Sportingbet responses explicitly mark fixtures suspended. We did not override those flags. No lost quotes were found for already-matched fixtures. Unrequested/unreturned competitions and expired data are not claimed as native coverage. No provider refresh was triggered merely to fill the UI.

## UX and QA

- Restrained vertical separators divide desktop bookmaker groups without reducing odds target width.
- One/two selected fixtures remain compact and expanded; larger lists are collapsed but editable. Comparison stays expanded directly after stake.
- Removed duplicated per-bookmaker leg lists, source notes, best-estimated badge, and the redundant pre-comparison aggregate total. Shared commercial disclosure appears once; responsible-gambling footer remains.
- At 390px: comparison begins approximately 212px into drawer content for one leg, 282px for two, and 128px for five/ten. Large slips no longer require scrolling through ten selection cards before comparison. Individual no-link cards measure approximately 166–167px tall.
- Browser-tested real Argentina and Série B fixtures and 1/2/5/10-selection slips. EN/PT-BR/ES-MX, light/dark, 320/390/430/1024/1440; additional EN 1280/1920 checks. Zero horizontal overflow. Minimum measured listing target width after the tablet fix: 45.5px; mobile Match Center targets 44px high.
- Fixed a discovered 1024px open-drawer regression: the reserved desktop rail squeezed odds to 29px; tablet now uses an overlay instead, with 73.5px odds targets in that scenario.
- No Estimated/Estimado/fallback-source wording in public comparison UI, including titles/accessibility labels. Internal data still identifies provenance.
- Betsson approved configuration is untouched. Non-eligible local GEO remains correctly gated. Sportingbet/betboo remain unapproved and have no fabricated CTA.
- Ordinary local listing, Match Center, and slip logs report providerRequests=0.

## Gates and budget

Tests: 1,171 passed (1,154 Vitest + 17 validation); typecheck, lint, production build, and secret scan passed. Tests cover native/Betano/alternate/unavailable branches in all locales, exact money calculation, provenance retention, and alias rejection for wrong time/competition/reversed/ambiguous fixtures.

09:45 UTC quota snapshot: conservative period use 1,626/5,000; rolling day 168/273 (61.5%); automatic ceiling 218 with 50 requests headroom. Internal safe remaining 3,124. No quota/cadence changes. Audit and replay consumed zero provider calls.

This file records pre-release evidence. Final deployed SHA and production acceptance are reported with the release response; do not interpret local gates alone as production acceptance.
