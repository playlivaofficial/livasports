# M5.1 — Odds activation

M5.1 extends M5's existing DB/cache-first implementation. It does not redo ingestion, alter subscription scope, change fixture timestamps, or start M6/M7/M8.

## Operational boundary

- Protected `/api/internal/odds-refresh`: bounded POST for controlled operator invocation; GET for an explicitly activated external scheduler.
- Protected `/api/internal/odds-health`: DB-only operational health. All responses are private/no-store/noindex.
- Server-only production `CRON_SECRET`, constant-time authentication, no query-driven targets, no Preview mutations. No secret or destination appears in browser props.
- `ODDS_AUTOMATION_ENABLED=false` in the existing Vercel project. No cron definition or office-computer loop was installed.
- Existing Hobby plan and empty cron definitions verified through the Vercel API on 2026-09-12. Only an unrelated RunX Railway context exists locally; it was not accessed or modified. No usable linked LivaSports worker was found.

`ODDS_INGESTION_IMPLEMENTED=YES`; `ODDS_AUTOMATION_OPERATIONAL=NO`. A successful controlled invocation is not evidence of automatic operation.

The approved infrastructure action is still missing: authorize a commercial hosting/scheduler arrangement that can issue a protected GET every five minutes (for example, a user-approved upgrade of this existing Vercel project), configure its secret, enable scheduling, and observe repeated production ticks. No service was purchased, upgraded or created. Hobby's daily cron cannot implement the selected odds cadence. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [Hobby usage](https://vercel.com/docs/plans/hobby).

## Commercial result

Betano BR pricing remains BR-only; its CTA remains disabled because affiliate approval/destination are absent. Betsson remains `GENERIC_UNVERIFIED` for BR and MX. Approval of the affiliate relationship does not certify feed jurisdiction or tracking configuration. There is no actual approved affiliate destination in Vercel, local secure environment or Neon.

Detailed evidence: [GEO](M5_1_BETSSON_GEO.md), [affiliate boundary](M5_1_AFFILIATE_ACTIVATION.md), [scheduler](M5_1_SCHEDULER.md), [budget](M5_1_REQUEST_BUDGET.md). Release evidence is in `output/m5-1-report.md`.
