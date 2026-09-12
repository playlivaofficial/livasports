# M5.1 final release checkpoint

2026-09-12: **RELEASED AND VERIFIED; STOP AT M5.1**. The explicit final user approval resolved the earlier main-release block. Feature `codex/m5-1-odds-activation`: implementation `58d8725202ed391b81373e952218a30a4458b3b0`, final checkpoint `ae853b7cf252978415ffd040e3bd2d696a659b34`, both pushed. Main application merge **`846577113c189a721ea66ae5855ef8b7b4c7d2fc`**, pushed normally and synchronized with origin/main. No force-push, Sportmonks request, timestamp repair or ingestion restart.

Neon audit 12:59:40 UTC: **34 enabled competitions, 904 fixtures, 50 odds fixture mappings, 651 retained current quote rows, 1,069 meaningful history rows**. No active/stale odds worker, pending snapshot, duplicate quote/history or orphan odds. Migration 009 repeated as no-op; duplicate lease and two post-production saved-response replays passed with zero provider calls/current/history/closure writes. Final gates: Node6 + Vitest189 (195 tests), typecheck/lint/build/secret scan PASS. Local server stopped. No background sync or office scheduler is running.

Existing Vercel project `nikapopkha3-4447s-projects/livasports` only. GitHub-triggered deployment **`dpl_7b5KdHUSDGSer2cphzVQdNQpAKjM` READY**, application commit `8465771`. Full production route/security/cache/expiry/visual QA passed with one documented transient existing profile-cache DB timeout; targeted BR/MX pages recovered without code or data changes. See `output/m5-1-report.md`. This report/checkpoint and screenshots are a final evidence-only follow-up; resolve their own publication hash from Git history and the exact final deployment from the completion response.

Production scheduler authentication is securely provisioned; `ODDS_AUTOMATION_ENABLED=false`. **Continuous automation NOT operational**; automatic invocation/refresh fields are null. Betsson BR/MX remains GENERIC_UNVERIFIED and public gated. Betano pricing is BR-only; both affiliate CTAs remain absent. No real approved destination exists. No service purchase/upgrade or unrelated project change occurred.

M5.1 provider usage: **3 HTTP calls = 2 billable OddsPapi batches + 1 unmetered account check; Sportmonks 0**. Local batch: 18 fixtures/126 quotes/25 history changes. Production batch: 20 fixtures/140 quotes/22 history changes, at 12:57:24 UTC. Immediate repeats: zero requests. Internal conservative usage 67, safe headroom 4,433 through the verified October 2 reset. A controlled proof is not automation.

BR/MX routes, 34/34 competition navigation, Match Center, profiles, sitemap, canonical/404 behavior and desktop/mobile layouts are preserved. Normal navigation providerRequests=0. Real production 15-minute expiry was observed on an open page without clock manipulation. No unapproved CTA or exposed secret.

No new work is pending automatically. Future authorized inspection only:

```sh
git fetch origin
git status --short --branch
git rev-parse HEAD origin/main
pnpm m5.1:audit
pnpm m5.1:plan
```

Load credentials only from ignored server environment files. Never print or commit their values. `pnpm m5.1:run` and HTTP `--invoke` intentionally consume quota; they are not inspection commands. Do not repeat the successful controlled production proof or deploy again unnecessarily. Saved-response replay is provider-free. Use only existing project ID `prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr` if a future explicitly authorized release is needed.

Continuous automation still separately requires approved suitable infrastructure and observed automatic ticks. It must remain disabled on the current Hobby setup. Betsson GEO and actual affiliate destination evidence remain missing. Do not redo full ingestion or timestamp corrections. **Do not start M6, M7 or M8.**
