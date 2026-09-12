# LivaSports M5 checkpoint

Checkpoint: 2026-09-12, M5 released. Feature `codex/m5-real-odds-comparison` at `74d0980` was safely merged into main `674e510`, both pushed. Existing Vercel project deployment `dpl_HMhULj1vY1WeU2jPmnVwp1czapSU` is READY on livasports.com; the full production route and real mobile odds QA passed.

Source of truth: Neon, `output/m5-report.md`, `output/m5-coverage-report.json`, and the seven `docs/M5_*.md` documents. Do not rerun earlier full ingestion or the provider capability audit.

Neon: 34 competitions, 42 seasons, 1,343 teams, 904 fixtures, 2,595 mappings, 651 current quote records, 1,022 history rows. Latest Betano response 39 fixtures/273 selections; Betsson 50/350. Withdrawn selections were closed, not counted as returned quotes. Exactly 50 evidence-backed kickoff corrections; the other 854 timestamps untouched. Canonical URLs retained. Both correction replays changed zero rows. Latest odds snapshot replay: zero quote/history writes for both books; no pending snapshot or running odds job.

Final request accounting: OddsPapi 15, Sportmonks 2; normal navigation zero. All account credentials and raw evidence are ignored. The recurring worker reads its verified catalogue and budget from Neon, not local cached files.

Tests 6 + 156, typecheck, lint, production build, migration no-op and secret scan pass. Real responsive visual QA is complete with final regression/status checks recorded in the report. Never claim two GEO-eligible bookmakers, configured CTA or continuous scheduler operation: those remain unverified/unconfigured.

Natural production expiry also passed at 12:11:45Z on 2026-09-12: three real prices disappeared on the same open browser page without any time override, reload or provider request. The final snapshot is expired by design; do not relabel it fresh. A local browser/build-directory lock was resolved by moving future temporary QA profiles outside `.next`; final build/scan passed afterward.

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

Release implementation is complete. Final report/coverage evidence is recorded in the release-evidence commit following `674e510`; resolve the current main hash with `git rev-parse HEAD` rather than embedding a self-referential hash. Do not repeat ingestion or kickoff correction. No later milestone is authorized by this checkpoint. The only remaining external activation requirements are documented GEO/affiliate verification and an approved scheduler; none is represented as operational.
