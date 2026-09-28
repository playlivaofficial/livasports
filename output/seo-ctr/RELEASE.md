# SEO CTR + Brazil relevance — release evidence

Date: 2026-09-28. Baseline production/main: `554be5da5e110ece38e098b36807b6294110cbfb`.

## Local acceptance

- Final calendar-date correction rerun: 1,574 Vitest tests across 195 files PASS; 17 legacy validation tests PASS. Typecheck, lint, production build and secret scan passed again. The corrected SQL returned all five `2026-09-29` starts as text on an Asia/Tbilisi host, matching the production owner dashboard.
- Typecheck, lint, production build and secret scan PASS (zero tracked env files, credential-value leaks and client secret references).
- Initial concurrent build/test run had one existing scheduler timeout; complete isolated-worker rerun passed without scheduler/test-threshold changes.
- 13 rendered routes compared with pre-release production: all HTTP 200, canonical/hreflang/robots/H1/schema types preserved; five exact selected title/description pairs applied.
- Browser sample: Spanish finished match and Brazil home at 375/390/430/768/1440, zero horizontal page overflow. Portuguese standings-intent match at 375, actual table and working anchor. Light/dark inspected; teams/competition/final score remain above the fold. New contextual links measure 44px tall.
- Local cache MISS/SET/HIT/deduplication observed; normal match/odds/profile reads report providerRequests=0. No browser errors on the sampled match.
- Additive migration 049 APPLIED; rerun ALREADY_APPLIED. Five immutable BEFORE registrations, 4,759 joined measurement rows. Two real saved-response SQL replays passed with rollback; zero added provider/GSC requests.
- No scorer/odds/provider/affiliate/owner-auth policy changes. Original dirty checkout preserved. Raw JSON/screenshots excluded from Git.

## Production release protocol

[Release PR #19](https://github.com/playlivaofficial/livasports/pull/19) records CI, merge SHA, existing Vercel deployment ID/status and post-release acceptance in its final evidence comment. No immediate CTR uplift is claimed.

After production verification, activate only the five `seo-ctr-2026-09-28` registrations with the verified main SHA using `scripts/seo-ctr-release.ts --activate --sha=<SHA>`. The helper checks every production metadata pair, canonical and indexability before atomic activation. Repeated activation cannot shift dates.

For a September 28 Pacific release, first full observation day is September 29:

| Window | Full days | Earliest complete read (three-day lag) |
|---|---|---|
| 7d | Sep 29–Oct 5 | Oct 8 |
| 14d | Sep 29–Oct 12 | Oct 15 |
| 28d | Sep 29–Oct 26 | Oct 29 |

Actual activation timestamps/windows are authoritative in the owner-only dashboard. Existing daily SEO cron is 05:40 UTC; delayed successful coverage can recover missed windows. Never fabricate a result before maturity.

Five experiments were activated at `2026-09-28T07:28:46.398Z` against verified release `0dcf13515cedbd80a56e9b03c0b3433fff9e5c73`; PostgreSQL stores observation start `2026-09-29`. Final QA caught local PostgreSQL DATE conversion displaying the previous day on a non-UTC machine. The follow-up fix reads this calendar value as SQL text in both reporting and capture paths, without rewriting activation dates, baselines, or public metadata. The table above remains correct.

Full baseline, exact old/new metadata, Brazil audit, implementation and limitations: [engineering report](../../docs/SEO_CTR_BRAZIL_OPTIMIZATION.md).
