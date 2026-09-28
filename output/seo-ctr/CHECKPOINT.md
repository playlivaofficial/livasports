# SEO CTR + Brazil relevance — local checkpoint

## Superseding update — 2026-09-28

The historical notes below are retained as the prior checkpoint, not the current blocker/state.

- User approved scoped CRON_SECRET/GSC access in memory. Fresh sync succeeded at 06:44:09.947 UTC; four joined reports captured at 06:44:14.879 UTC. No credentials saved/exported; sports providerRequests=0.
- Migration 049 APPLIED and idempotent; five immutable experiment baselines registered but not activated. 4,759 joined rows. Two offline ingestion replays passed in a rolled-back transaction.
- Five selected metadata changes, three factual intros, contextual Brazil links, and owner experiment UI implemented. Ranking weights and technical SEO policy unchanged.
- Final local gates: 1,572 application tests plus 17 legacy tests PASS; typecheck/lint/build/secret scan PASS. Local mobile/desktop sample has zero overflow. PR/release remains pending.
- Seven-day forward current-inventory audit: Brazil 6,7,7,10,10,10,10 of ten (not historical observed rankings). No generation or provider calls.
- Next: final gates, fetch main, PR/CI/merge, existing Vercel release, production QA, then atomic experiment activation using the verified SHA. See docs/SEO_CTR_BRAZIL_OPTIMIZATION.md and output/seo-ctr/RELEASE.md for final evidence.

## Historical checkpoint (superseded)

Date: 2026-09-28. **IN PROGRESS; NOT RELEASED.**

## Repository and production

- Authoritative origin/main and verified production health release.commit: `554be5da5e110ece38e098b36807b6294110cbfb`.
- Production apex: https://livasports.com. No deployment or production configuration changes performed.
- Original dirty checkout `C:/Users/User/Documents/ChatGPT/liva sports`, branch `codex/secondary-native-odds-validation`, was preserved without stash/reset/discard.
- Isolated branch: `codex/seo-ctr-brazil`.
- Isolated worktree: `C:/Users/User/Documents/ChatGPT/liva sports/.qa-master/seo-ctr`.
- Original checkout reports `.qa-master/` as untracked because its older ignore file differs. **Do not add that directory in the original checkout.** Work and commit only in the isolated worktree.

## Verified BEFORE evidence so far

Read-only evidence files: `before-2026-09-28T06-26-14.605Z.json`, `before-2026-09-28T06-27-20.856Z.json`.
These are snapshots of the already-stored successful GSC sync at **2026-09-28T05:40:48.861Z**, not a new manually triggered sync.

- Complete seven-day window: Sep 19–25; 14 clicks / 7,060 impressions / 0.1983002833% CTR / position 14.4983002833.
- Previous seven days: 0 clicks / 200 impressions / position 11.245.
- 28 days: 14 clicks / 7,260 impressions / position 14.408677686.
- Brazil: 3 clicks / 2,622 impressions / 0.114416476% CTR / position 15.379099924.
- PT-BR: 2 / 3,166; EN: 11 / 2,894; ES-MX: 1 / 1,886 (page-dimensional counts; do not equate sum to property totals).
- Mobile: 12 / 3,847; desktop: 2 / 3,146; tablet: 0 / 67.
- Technical monitor: 14,877 submitted URLs, 24 sampled, zero detected problems; robots healthy. GSC sitemap metadata: zero errors, one sports sitemap warning whose cause is not yet verified.
- Active Top 10: Brazilian fixtures occupy ranks 1–5. Current stored upcoming seven-day inventory includes 1 Série A and 12 Série B fixtures. This is **stored inventory**, not proof of the real calendar's completeness.
- Several high-impression pages are historic and already noindex under the existing decay policy: LOSC–Nice (Jan 2025), Belgrano–Real Tomayapo (May 2024), Modena–Empoli (Oct 2025), Toluca–Santos Laguna (Apr 2025), Dynamo Kyiv–AZ (Nov 2010). Preserve decay; do not enroll these in CTR experiments or remove global pages.
- Birmingham–Middlesbrough, Willem II–Fortuna and Mantova–Pisa remain indexable. DB confirms actual lineups/statistics/standings. Query intent may be satisfiable, but page-query association must come from joined GSC reports, not guessed from top lists.
- Existing GSC ingestion stores independent dimensions only. Per-page Brazil/mobile/query evidence is not yet available. Do not invent it.

## Uncommitted local groundwork

- Additive migration `049_seo_ctr_experiments.sql` (NOT APPLIED) proposes page breakdown history, measurement coverage, immutable baseline experiments and observations.
- `page-breakdowns.ts`: bounded page/query, page/country, page/device GSC reads; no public-route network calls; sanitized failures; separate page totals from query suppression.
- `experiment-windows.ts`: first full Pacific day after deployment; fixed 7/14/28-day windows; descriptive only, never automatic winners or rollback.
- `experiments.ts`: explicit immutable registration and one-time activation after deployment verification; persisted follow-up reads.
- Existing GSC ingest/SEO monitor wired locally to the new measurement layer. Not deployed; migration required before release.
- Read-only audit script and narrow server-only preload added.
- Public titles/descriptions, ranking weights, canonical/hreflang/sitemap policy, sports providers, odds, affiliate logic and public UI remain untouched.

## Safety blocker / outstanding approval

Automatic tool review rejected `vercel env pull` because exporting **all** production environment values would unnecessarily copy secrets to a local file. It did not execute. Do not retry via an alternate bulk-export mechanism.

Two scoped questions were sent to the owner and are awaiting a reply:

1. Allow retrieval of only existing production CRON_SECRET into memory to invoke the current authenticated SEO refresh endpoint.
2. Allow only existing GSC credential variables in memory for read-only joined per-page measurements. No saving or printing credential values.

Existing owner browser session is active at `/owner/growth/seo`; current Vercel CLI authentication was verified with whoami. Production project identifiers were verified. No credentials have been copied into this worktree.

## Checks at checkpoint

- Focused SEO/metadata/localization/ranking suite: **141/141 PASS**.
- Typecheck: PASS after final test-typing cleanup.
- Changed-file lint: PASS after correcting unused test-parameter warnings.
- Secret scan: PASS, 0 environment files / credential leaks / client references.
- Full suite/build/mobile QA: NOT EXECUTED for release yet.
- No commit, push, migration, production write or deployment.

## Exact resume point

1. Read the original request and this checkpoint; inspect the isolated branch without resetting the original checkout.
2. Resolve scoped permission reply before accessing production credentials. Fresh GSC sync is required before metadata/ranking changes.
3. Finish/review/test the measurement implementation (including completeness, idempotency, concurrent sync safety, mature-window recovery and owner-only UI) before migration.
4. Apply only the additive migration after its gates. Fetch exact page/query/country/device evidence; capture final BEFORE snapshot and equal-duration 7/14/28 baselines.
5. Select a small explicit set of still-indexable pages with genuine demand. Preserve historic decay and global traffic; do not bait unsupported intents. No public metadata has been edited yet.
6. Audit representative Top 10 history and existing contextual links. Do not change weights without evidence. Complete Brazil coverage audit and minimal contextual-link improvements.
7. Finish owner dashboard experiments/opportunities UI and relevant tests; verify mobile rendered pages.
8. Run full gates, clean diff/security review, fetch main again, safe branch→PR→main release to existing Vercel only, verify deployed tags and activate experiment timestamps after exact production verification.
9. Record actual deployment date and 7/14/28 full-day measurement due dates (+GSC lag). Do not claim immediate CTR uplift.

Read-only audit invocation from isolated worktree:

```powershell
node --import ./scripts/seo-ctr-preload.mjs --import tsx --env-file='C:/Users/User/Documents/ChatGPT/liva sports/.env.production.local' scripts/seo-ctr-audit.ts
```

That existing ignored environment file is read directly; never copy it or commit it. Sports provider requests during this audit: **0**.
