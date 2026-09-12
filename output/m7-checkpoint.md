# M7 release checkpoint

**M7 complete: application released and production verified. Stop after M7.**

- Branch `codex/m7-full-slip-comparison`, base/fetched main `2ccb82ffda11ad62c41339ffd371be38effea900`.
- Correct `playlivaofficial` GitHub access restored. Use command-scoped `credential.username=playlivaofficial`, with `credential.helper=manager`; do not use the stale `nika1578` account.
- All pre-release gates pass: 307 tests, typecheck, lint, production build, secret scans, 102 replay checks, 27 real browser checks, HTTP/regression/provider audits and rolled-back migration rehearsal.
- M7 feature work is complete. Five required docs and report are present. Approved Betsson destination remains configuration-gated, per owner instruction; odds eligibility stays confirmed.
- Implementation `9cd1402094c852eca93dab865901eb91703bcc03` pushed on feature; safe merge `4c7b3cbdd2e774d130d313fc3b85ed979b8752c8` pushed to main. Local main equaled origin/main and was clean at the application release.
- Migration 011 applied once on existing Neon; second run was a no-op. Existing production deployment `dpl_YyEwYrRKeGDGFYNMqi3TXDfeyXYo` is READY at that exact main merge.
- Production QA passes: full route regression; 17 M7 HTTP checks; 27 real browser regression checks; 24 real current-price/math/analytics checks; 17 current-price browser checks; 42 existing M6 real-interaction checks; secret scan; DB integrity and real post-kickoff invalidation.
- Production before/after expiry audit: 7 checks PASS, both totals/best labels removed and saved intent preserved. The QA runner's initial intermediate timing assertion missed the short window because server time is 28.4 seconds ahead of this host; its clock reference is corrected. Exact intermediate timing remains local-replay evidence; no application defect or further provider refresh was needed.
- Final changes contain QA helpers, safe screenshots and reports only. Application source remains the verified merge. Publication of this evidence is followed by exact main/origin equality, clean-tree, READY deployment and apex-alias verification; immutable final IDs are recorded in the task completion message.
- No release/product approval is needed. Explicit autonomous release authorization remains in force.
- Production runs M7. One bounded CONTROLLED refresh job `e5745519-81e5-44e0-94bd-11564d59ba1e` SUCCEEDED, exactly two OddsPapi requests, zero Sportmonks. Normal interaction provider delta stays zero. This is not continuous automation.
- Existing project only: `prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr`, `team_rtsOqa3gRkQZwndpkXwyMDno`.
- Preserve M5.1 truth: continuous automation disabled/non-operational; authoritative 15-minute expiry. Do not fabricate production pricing, invent affiliate links, create projects, upgrade plans or begin M8.
