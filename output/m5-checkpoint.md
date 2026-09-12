# LivaSports M5 checkpoint

Checkpoint: 2026-09-12, final local release gate. Branch `codex/m5-real-odds-comparison`, based on main `98bb979`. Implementation and migration are complete; production release is pending at this checkpoint.

Source of truth: Neon, `output/m5-report.md`, `output/m5-coverage-report.json`, and the seven `docs/M5_*.md` documents. Do not rerun earlier full ingestion or the provider capability audit.

Neon: 34 competitions, 42 seasons, 1,343 teams, 904 fixtures, 2,595 mappings, 651 current quotes, 846 history rows. Exactly 50 evidence-backed kickoff corrections; the other 854 timestamps untouched. Canonical URLs retained. Both correction replays changed zero rows. Latest odds snapshot replay: zero quote/history writes for both books; no pending snapshot or running odds job.

Current request accounting: OddsPapi 13, Sportmonks 2; normal navigation zero. All account credentials and raw evidence are ignored. The recurring worker reads its verified catalogue and budget from Neon, not local cached files.

Tests 6 + 156, typecheck, lint, production build, migration no-op and secret scan pass. Real responsive visual QA is complete with final regression/status checks recorded in the report. Never claim two GEO-eligible bookmakers, configured CTA or continuous scheduler operation: those remain unverified/unconfigured.

## Resume commands

Use the repository's existing server-only environment on the authorized computer. Never paste credentials into command arguments or commit environment files.

```sh
git status --short --branch
git fetch origin
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm secret:scan
pnpm m5:verify
pnpm m5:resume
```

`m5:resume` only replays saved unapplied snapshots. A deliberate `pnpm m5:refresh` normally costs two requests and has a four-request hard run cap; do not run it merely to read pages. `scheduled-refresh` is implemented but no external scheduler is operational.

Finish only the current M5 release: commit feature, push feature, safely merge/push main without force, deploy to the existing linked Vercel project, and run production route/rendered/cache/secret QA. Do not create a new project or start a later milestone. Update this checkpoint with the actual release evidence afterward.
