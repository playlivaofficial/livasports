# LivaSports M4 — Refresh and Request Budget

## Real operational status

| Layer | Status |
|---|---|
| DB/cache-first Match Center reads | OPERATIONAL |
| Browser refresh against LivaSports DB endpoint during stored LIVE/HALFTIME | OPERATIONAL |
| Controlled manual Sportmonks enrichment with lease/resume | OPERATIONAL |
| Automatic fixture/score scheduler | NOT OPERATIONAL |
| 24/7 upstream live refresh | NOT OPERATIONAL |
| OddsPapi use in M4 | 0 requests |

The client polling boundary cannot create fresh provider data. It only detects a newer durable database snapshot (independent of an optional provider timestamp). Therefore M4 does not claim real live production operation until a server-side scheduler is activated and observed.

## Policy encoded in the application

- Upcoming fixture discovery: 60 minutes.
- Pregame detail: 30 minutes.
- Live snapshot target: 30 seconds.
- Standings: 30 minutes.
- Final reconciliation: 2, 15, and 120 minutes after finish.
- Live UI stale threshold: 90 seconds.

These are policy values and budget inputs, not proof that a scheduler is running.

## Budget example

Two concurrent live fixtures for six hours, five active pregame fixtures, and three standings competitions would use an estimated 1,824 Sportmonks requests per day at the policy above:

- live snapshots: 1,440
- pregame detail: 240
- standings: 144

This is an illustrative upper-bound scenario, not an approved production allocation. Concurrency, match state, visibility, module eligibility, and post-final reconciliation must be used to suppress unnecessary work.

## Hosting limitation

The existing project is on Vercel Hobby. Vercel documents that Hobby cron jobs run at most once per day with broad timing precision, which cannot satisfy a 30-second live cadence. Vercel also describes Hobby as personal/non-commercial use. M4 can be deployed safely as a cache/DB-backed Match Center, but commercial launch and 24/7 live automation require an approved production scheduler/hosting arrangement. No plan purchase or upgrade was made.

## Safe activation path

1. Select an approved scheduler/worker with overlapping-job exclusion and secret storage.
2. Invoke a server-only refresh worker; never expose Sportmonks credentials to a browser.
3. Use match-state eligibility and leases before every provider call.
4. Start with a controlled competition/time window and compare request counters to the estimator.
5. Observe a real live match, stale recovery, terminal-state stop, and final reconciliation.
6. Only then mark 24/7 live refresh operational.

References: [Vercel cron pricing/limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Vercel Hobby plan](https://vercel.com/docs/plans/hobby).
