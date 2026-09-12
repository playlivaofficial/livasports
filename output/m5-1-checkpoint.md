# M5.1 checkpoint

2026-09-12: **SAFE CHECKPOINT — MAIN RELEASE BLOCKED BY APPROVAL REVIEW**. On `codex/m5-1-odds-activation`, implementation `58d8725202ed391b81373e952218a30a4458b3b0` pushed, based on clean synchronized main `1c93365`. M5.1 scope only. Additive migration009 applied and repeated as no-op. Controlled local protected invocation passed; 1 billable OddsPapi request and 1 unmetered account check. No Sportmonks request, timestamp repair or ingestion restart.

Neon remains source of truth: 34 competitions, 904 fixtures, 50 odds fixture mappings, 651 retained quotes, 1,047 history rows. No active/stale odds worker or pending snapshot. Duplicate lease and two saved-response replays passed with zero provider calls/writes. Local route regression, all requested rendered cases and five-width price rendering passed. Final gates: Node6 + Vitest189, typecheck/lint/build/secret scan PASS. Local server stopped. No background sync or office scheduler is running.

Vercel existing project only. Production `CRON_SECRET` securely provisioned; `ODDS_AUTOMATION_ENABLED=false`. No recurring scheduler is running. Betsson generic GEO remains gated, both affiliate CTAs remain absent. No destinations exist in current secure configuration. Never claim otherwise.

Resume with `git status`, `output/m5-1-report.md`, and `pnpm m5.1:audit` / `pnpm m5.1:plan` (zero provider calls). Do not run a paid refresh merely to inspect state. Existing `pnpm m5.1:replay` proves snapshot idempotency; `pnpm m5.1:run` is an intentional, capped CONTROLLED refresh only. Do not start M6/M7/M8.

Exact resume point: implementation and local QA are complete and the feature is pushed. The safety reviewer rejected the main merge/push before it ran, requiring explicit conversational confirmation despite the attached brief's release section. Do not bypass that refusal. Obtain the user's explicit approval to merge/push/deploy M5.1, then verify the feature and origin/main state and continue ONLY release/production QA.

Main/origin main still equal `1c93365caa98a23faadc55e6cd2a21cdee1270d5`. Existing M5 production remains READY at `dpl_Fo8ySZAbv2usSq9HSECXMPdMe73p`; it is NOT an M5.1 deployment. The report/checkpoint-only follow-up commit on the feature records this state; use feature HEAD for its exact hash.

After explicit release approval:

```sh
git fetch origin
git status --short --branch
git rev-parse HEAD origin/codex/m5-1-odds-activation main origin/main
git switch main
git merge --no-ff codex/m5-1-odds-activation -m "merge: release M5.1 guarded odds activation"
git push origin main
pnpm dlx vercel@48.10.1 deploy --prod --yes --scope nikapopkha3-4447s-projects
```

Use only the existing linked project (`prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr`). Inspect deployment metadata first to avoid a duplicate if GitHub already starts one. After READY, use `scripts/m5-1-http-qa.ts https://livasports.com --invoke` with the ignored production scheduler environment for ONE bounded production proof, then DB-only integrity/replay checks, `scripts/m5-route-qa.ts`, `scripts/m5-1-navigation-qa.ts`, rendered QA and remote secret scan. Never print the secret; never make provider calls for ordinary route tests. Record actual final deployment/commit/usage and stop at M5.1.

Continuous automation still separately requires user-approved infrastructure. It must remain disabled on Hobby; no purchases or upgrades are authorized. Betsson GEO and actual affiliate destination evidence remain missing. Do not redo the prior audit, full ingestion, timestamp correction or controlled local refresh.
