# LivaSports M3.6 — Safe Checkpoint

Checkpoint timestamp: **2026-09-07T22:28:08+04:00**

Repository: `playlivaofficial/livasports`

Branch: `main`
Status: **CHECKPOINTED — M3.6 INCOMPLETE — NOT DEPLOYED**

## Completed work

- Completed a live coverage-only validation of the final 34-entry updated-subscription set.
- Confirmed exact, unambiguous Sportmonks mappings for all 34 entries: 29 selected regular competitions, the automatically included Saudi Pro League Play-offs, and four Euro Club Tournaments bundle competitions.
- Live coverage result: 26 `SUPPORTED`, 8 `SUPPORTED_BUT_NO_CURRENT_FIXTURES`, 0 `NO_SUBSCRIPTION_ACCESS`, 0 `NOT_FOUND`, and 0 `AMBIGUOUS_MAPPING`.
- Confirmed Liga MX as Sportmonks `Liga MX` / provider ID `743`.
- Confirmed the Euro bundle: Champions League `2`, Europa League `5`, Europa Conference League `2286`, UEFA Super Cup `1328`.
- Preserved and expanded canonical competition, season, team, fixture, and provider mapping data in Neon.
- Added bounded provider normalization and batch team/fixture upserts after a Neon pool timeout exposed unsafe high-cardinality row-by-row writes.
- Prevented unchanged provider mappings from being rewritten on idempotent runs.
- Added a credential-safe read-only `pnpm db:checkpoint` inspection command.
- No International Tournaments package competitions were added.
- M4 was not started and no partial M3.6 deployment was performed.

## Exact database snapshot

| Entity | Count |
| --- | ---: |
| Enabled competitions | 34 |
| Seasons | 42 |
| Current seasons | 33 |
| Teams | 1,159 |
| Fixtures | 513 |
| Provider entity mappings | 2,370 |

All 34 canonical competition mappings exist. The exact provider IDs and current fixture-window classifications are in `output/m3-6-coverage-report.md` and `output/m3-6-coverage-report.json`.

## Ingestion state at stop

- Current sync process: **stopped by operator for checkpoint**.
- Latest run record: `TEAMS` is left `RUNNING` from `2026-09-07T18:10:44.448Z` because the process was intentionally interrupted after committed batches were preserved. Treat it as an abandoned checkpoint run, not an active worker.
- Latest successful stage before the interrupted run: `SEASONS` — 0 inserted / 34 updated / 34 provider requests / no stage errors.
- Earlier expanded `TEAMS` stage: `SUCCEEDED` — 390 inserted / 396 updated / 33 provider requests, with sanitized partial errors for `fa-cup`, `europa-league`, `champions-league`, and `conference-league`.
- Earlier expanded `FIXTURES` stage: `SUCCEEDED` with partial errors — 157 inserted / 108 updated; `EUROPE` and `OTHER` groups were incomplete.
- Earlier `SCORES` stage: `FAILED` with a sanitized database diagnostic and no provider request recorded.
- No sync was started after the checkpoint stop.

Competitions with teams but no stored fixtures at the checkpoint:

- Championship — 24 teams
- FA Cup — 579 teams
- Carabao Cup — 92 teams
- Ligue 2 — 18 teams
- Serie B (Italy) — 20 teams
- Coppa Italia — 45 teams
- La Liga 2 — 22 teams
- Super Lig — 18 teams

Competitions with neither teams nor stored fixtures at the checkpoint:

- Paulista A1
- Carioca Serie A
- Copa do Nordeste
- UEFA Champions League
- UEFA Europa League
- UEFA Conference League
- CONCACAF Champions Cup
- UEFA Super Cup
- Copa del Rey
- Saudi Pro League Play-offs

Some zero-fixture competitions legitimately had no fixtures in the controlled 2026-08-31 through 2026-09-28 window. UEFA Champions League and UEFA Europa League did have provider fixtures in that window, but their team/fixture persistence remains incomplete.

## Known issue and applied fix

The first expanded bootstrap exposed `timeout exceeded when trying to connect` while high-cardinality team/provider mappings were being normalized against a five-connection Neon pool. The provider itself remained reachable.

Applied fixes now in the checkpoint:

- provider normalization concurrency is bounded to four;
- unchanged provider mappings skip redundant writes;
- team and fixture writes use set-based PostgreSQL batches.

The corrected run was stable and continued increasing database counts, but it was intentionally stopped for this checkpoint before full completion. A provider-country cache is still a useful follow-up optimization before the final full idempotency run.

## Sportmonks request usage

- Updated-subscription coverage-only run: 21 requests.
- First expanded run: 21 coverage + 34 season + 33 team requests; fixture discovery reused cached coverage responses; the failed score stage recorded 0 provider requests.
- Interrupted corrected run: 21 coverage + 34 season requests are confirmed; its in-progress team-stage request count was not persisted before interruption.
- Exact confirmed minimum for the updated-subscription work: **164 requests**, plus the interrupted run's unpersisted team-stage requests.
- No website navigation triggered provider requests.

## Quality gates at checkpoint

- Tests: **PASS** — 59 Vitest tests plus 6 Node validation tests
- Typecheck: **PASS**
- ESLint: **PASS** — zero warnings
- Production build: **PASS** — Next.js 16.3.4 production build completed
- Secret scan: **PASS** — 14 locally loaded credential values checked against 144 commit-candidate text files; 0 matches
- `.env`, `.env.local`, `.env.production.local`, and `.vercel/`: **ignored and excluded from Git**

## Exact resume point

From a new computer:

```bash
git clone https://github.com/playlivaofficial/livasports.git
cd livasports
pnpm install --frozen-lockfile
```

Restore the ignored server-only `.env` and `.env.production.local` files locally. Do not copy credentials into Git or reports. Then inspect the preserved state without provider calls:

```bash
pnpm db:checkpoint
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Resume M3.6 only after verifying the old `TEAMS` record is an abandoned checkpoint record and no worker is active. Complete the provider-country cache optimization, then run one controlled full resume and one idempotency verification:

```bash
pnpm sync:expansion
pnpm db:checkpoint
pnpm sync:expansion
pnpm db:checkpoint
```

The first resumed run must finish all `TEAMS`, `FIXTURES`, and `SCORES` stages without unsanitized errors. The second must create no duplicate competition, season, team, fixture, or mapping rows. Update `output/m3-6-report.md`, rerun local route/cache/mobile QA, and only then consider an M3.6 production deployment. Do not start M4.
