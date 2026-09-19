# Traffic launch checklist

Do not generate traffic automatically. Release readiness and acquisition are separate decisions.

## Before traffic

- [ ] Exact approved SHA on apex; deployment READY; HTTPS/www redirect pass; previous stable deployment identified.
- [ ] P0=0 and P1=0; public/auth/account/favorites/My Matches/slip/affiliate path pass.
- [ ] Owner health evaluated now: scheduler recent, no unexplained active-major-competition price collapse; missing upstream prices classified honestly; budget headroom safe.
- [ ] Owner alert OPENED + RESOLVED delivered once each; replays deduplicated; no synthetic public outage.
- [ ] Analytics QA/OWNER/BOT excluded from HUMAN; click ledger ↔ redirect event paired once; no fabricated deposits/FTDs/revenue.
- [ ] Main sitemaps and robots/canonical/hreflang correct; GSC/Bing submission success distinguished from actual indexing.
- [ ] Responsive layout, auth errors, 404s, cookie/security policy, sponsor sandbox and providerRequests=0 pass.
- [ ] DB migrations/indexes/locks/integrity green; six-hour recovery window understood; rollback operator available.
- [ ] Review current hardening report for explicit NOT RUN / external limitations rather than treating them as PASS.

## Daily

Morning and evening: owner health 24h/3d/7d/14d, independent bookmaker REAL coverage, proxy/neither/stale, major competitions, scheduler tick and request budget. Inspect analytics HUMAN acquisition/funnel, signs of spam/identity mixing, affiliate click/event pairing, auth/email errors, public 5xx. Check Search Console crawl/index warnings without expecting immediate indexing.

## Weekly

Review index growth, top landing pages, auth/favorites retention, funnel drop-off, proxy share, bookmaker coverage, provider usage projection, email failures, database growth/retention and runtime latency. Investigate regressions against the prior period, not low-traffic zeros. Do not buy capacity or change subscriptions without approval.

## Staged exposure

1. Small organic/social/internal canary only after readiness approval.
2. Moderate planned exposure after 24 hours of healthy core journeys and operations.
3. Full planned exposure after stable 48–72 hours. Pause expansion on unexplained coverage, conversion, auth, security or performance regressions.
