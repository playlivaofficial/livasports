# M6 checkpoint

Checkpoint: 2026-09-12, local release verification in progress.

Baseline main: `f05a8a1390ad35e03da972c1461dfea9bcc304eb`. Active feature branch: `codex/m6-bet-slip-builder`. No M7/M8. The user explicitly authorizes release after all gates pass; no further approval is required.

Implementation and documentation are present in the working tree. Migration 010 is already applied to Neon and repeated as a no-op; never rerun M3.6/M4 ingestion. Existing data are intact. One controlled M6 OddsPapi call has occurred, with ledger 19 and cumulative Sportmonks 262. No upstream calls may be triggered from navigation.

All local gates passed at 13:49 UTC: 6 Node + 242 Vitest tests, typecheck, lint, production build, secret scan; real slip/five-viewport/cross-tab/SPA/back-forward QA; local-only edge replay; migration no-op repeat and data integrity. Protected scheduler checks pass after loading `.env.m5-1.local` (its secret is absent from the other local files). Do not print any environment value.

Then commit/push feature, fetch and safely merge main, push without force, verify synchronization, and use only the existing linked Vercel project's Git deployment. Run full production route/cache/secret/browser/provider-ledger QA, update the M6 report with observed evidence, push any evidence-only follow-up, verify final deployment and clean tree, stop after M6. Never interpret a controlled refresh as automation.

Useful checks (Git Bash or another shell; credentials remain in ignored files):

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm secret:scan
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env scripts/m6-audit.ts audit
node scripts/m6-browser-qa.mjs http://localhost:3300 real
node scripts/m6-navigation-browser-qa.mjs http://localhost:3300
node scripts/m6-edge-browser-qa.mjs
```

The real browser test requires at least eleven real fresh matches to exercise the tenth/eleventh limit. Do not repeatedly refresh providers to satisfy it; use existing valid snapshots and the controlled worker only when necessary for bounded verification. Edge replay is localhost-only and does not mutate canonical data or persist invented prices.
