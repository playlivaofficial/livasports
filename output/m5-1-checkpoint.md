# M5.1 checkpoint

2026-09-12: on `codex/m5-1-odds-activation`, based on clean synchronized main `1c93365`. M5.1 scope only. Additive migration009 applied and repeated as no-op. Controlled local protected invocation passed; 1 billable OddsPapi request and 1 unmetered account check. No Sportmonks request, timestamp repair or ingestion restart.

Neon remains source of truth: 34 competitions, 904 fixtures, 50 odds fixture mappings, 651 retained quotes, 1,047 history rows. No active/stale odds worker or pending snapshot. Duplicate lease and two saved-response replays passed with zero provider calls/writes. Local route regression and five-width price rendering passed. More final QA/release evidence is being completed in this turn.

Vercel existing project only. Production `CRON_SECRET` securely provisioned; `ODDS_AUTOMATION_ENABLED=false`. No recurring scheduler is running. Betsson generic GEO remains gated, both affiliate CTAs remain absent. No destinations exist in current secure configuration. Never claim otherwise.

Resume with `git status`, `output/m5-1-report.md`, and `pnpm m5.1:audit` / `pnpm m5.1:plan` (zero provider calls). Do not run a paid refresh merely to inspect state. Existing `pnpm m5.1:replay` proves snapshot idempotency; `pnpm m5.1:run` is an intentional, capped CONTROLLED refresh only. Do not start M6/M7/M8.

Remaining for this release: final gate rerun, finish all rendered cases, commit/push feature, safe main merge/push, deploy existing project, production boundary/route/cache/secret/visual QA, and record final identifiers. Continuous automation requires a separate user-approved infrastructure action, not unapproved purchases.
