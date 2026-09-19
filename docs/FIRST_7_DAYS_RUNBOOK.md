# First 7 days runbook

## Morning / evening

Traffic remains on hold after hardening until the documented coverage/budget P1 is closed. These checks are operational guidance, not permission to start acquisition. Successful cron execution with zero requests, or a HEALTHY aggregate badge, does not prove fresh independent bookmaker coverage.

1. Read `/api/internal/health` release.commit and confirm the expected production deployment.
2. Open `/owner/health`: recent scheduler, 24h major competitions, both bookmakers' REAL coverage, proxy/stale/neither, open incidents and remaining requests. Budget stops must stay enabled.
3. Open `/owner/analytics` HUMAN view: acquisition → odds → slip → comparison → affiliate; sign-ins/favorites/My Matches. Compare sample counts with click ledger; OWNER/QA/BOT are not customers.
4. Check Vercel unexpected errors/latency and Resend delivery. Check both sitemap indexes and Search Console/Bing crawl warnings. Inspect one representative mobile sports/slip journey without monetized clicks.
5. Record UTC observations, scope and incident IDs. A zero small-sample funnel is not proof of a bug.

## Escalation

- **P0: pause traffic immediately** for broad odds/comparison failure, public 5xx, broken auth/owner login, affiliate redirects, any secret/security exposure, corruption, or provider calls caused by normal navigation. Disable expansion, preserve evidence and data; roll back the app only if a release regression is demonstrated.
- **P1: fix before traffic/expansion** for incorrect slip math, major mobile/auth/favorites/funnel failure, repeated 500s, severe latency, or an active major competition silently unpriced despite accessible provider evidence.
- Review stale/missed scheduler ticks against configured SLOs, not a manually invented polling target. An upstream error may justify degraded service, but must be visible and must not cause unbounded retries.
- **P2: record, do not reflexively pause** for isolated cosmetics, niche upstream bookmaker absence, search-engine discovery delay, or low-traffic zeros.

## Recovery boundaries

Use protected owner re-check first (DB-only). A paid targeted refresh requires confirming target, cooldown, lease and request budget; stop after clear upstream failure. Never run full ingestion as a troubleshooting reflex. Never widen fixture match tolerance, forge odds, copy proxy into provider truth, reset DB or rotate owner/session secrets on deploy.

Existing application rollback: previous stable Vercel deployment documented in `FINAL_LAUNCH_HARDENING.md`. Database recovery: current Neon history is only six hours; diagnose promptly, identify safe UTC recovery point, and get explicit approval before restore/cutover/new branch. App rollback is not database rollback. Preserve current state and test auth/favorites/odds after any authorized recovery.

## Launch-week freeze

No new markets/operators/sports, design rewrite, scheduler source, subscription, migration destructive to valid data, GEO bypass, unapproved affiliate destination or new milestone. Fix scoped defects with tests → typecheck/lint/build/secret scan → exact-SHA release → bounded production QA. Keep release and data changes reversible. Do not expose credentials in evidence.

Days 1–2: small canary and twice-daily checks. Days 3–4: expand only after 24–72h stability. Days 5–7: review funnel/dropoff, index growth, independent bookmaker coverage, budget projection, DB growth and incidents; decide next work from real evidence, not invented conversions.
