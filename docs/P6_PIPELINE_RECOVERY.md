# P6 — Football/odds pipeline recovery (2026-09-22)

Production symptom: the homepage showed no fixtures for the day and odds stopped refreshing. All timestamps UTC.

## Root causes (evidence from production tables, read-only)

1. **No automatic fixture ingestion.** `ingestion_sync_runs` (FIXTURES) last succeeded 2026-09-14T06:45Z through a manual
   run. Season schedules existed far ahead, but recent kickoff changes were never re-read, and days between the manual
   windows had no rows. Fix: `src/ingestion/fixture-ticker.ts` — every 6 hours on the existing scheduler tick,
   `fixtures/between` for yesterday → +21 days with the registry league filter (advisory lock, failure/auth cooldowns).
2. **Scheduler stall.** From 2026-09-21T14:20Z every automatic tick ended `FAILED` in ~1.5 s with zero provider requests.
   A saved provider response (`odds_sync_snapshots`, betsson / tournament 155, observed 14:15:14Z) was replayed before
   every tick and threw `INVALID_NATIVE_SOURCE_QUOTE` (one quote of an already-started fixture with a non-positive TTL),
   so the tick never reached its plan. The endpoint answered **503** for `FAILED`, and the external cron (cron-job.org)
   disabled the job after repeated non-2xx answers: last invocation 2026-09-21T16:25:05Z. Fixes:
   - per-quote validation (`classifyNativeSourceQuote`): invalid/unverified quotes are rejected and counted, never fatal;
   - closed/expired quotes are not part of the native-source batch (`odds/ingestion.ts`);
   - bounded snapshot replay: `replay_failures`, `replay_error`, `quarantined_at` (migration 034) — three failures →
     quarantine, recovery-action log (`SNAPSHOT_REPLAY_FAILED` / `SNAPSHOT_QUARANTINED`) and a CRITICAL
     `STORE_WRITE_FAILED` integrity finding so an incident opens; the tick continues to its plan;
   - `/api/internal/odds-refresh` answers **200** for every completed tick (state is reported through owner health);
     409 (lease) and 503 (infrastructure) remain;
   - `.github/workflows/odds-refresh.yml` runs on a 10-minute fallback schedule (uses the `CRON_SECRET` Actions secret).

   **Ticker after recovery (2026-09-22):** cron-job.org stays disabled and unreachable from this environment, so the
   primary ticker is now a first-party **Vercel Cron** (`vercel.json`, `*/5 * * * *` → `/api/internal/odds-refresh`;
   Vercel signs cron requests with `CRON_SECRET`, which the route already requires). GitHub Actions remains the
   10-minute fallback. Overlaps are de-duplicated by the scheduler's advisory lease (409 = healthy).
3. **Catalog noise.** 454 `UNMATCHED` and 2 `AMBIGUOUS` rows were competitions LivaSports does not offer or split-season
   twins without fixtures. `classifyCatalogRows` now marks them `IGNORED_WITH_REASON` deterministically (no fuzzy
   auto-mapping; a twin with upcoming fixtures stays `AMBIGUOUS`; a country with an unmapped registry competition keeps
   `UNMATCHED` with the candidate list).

## Product change

Default home (no explicit view/date/competition) shows the **next 7 local calendar days** (`localDaysRange`,
`weekHomeSections`): live first, then chronological, competitions ordered by first kickoff; explicit Today/Live/Upcoming/
Results filters and dates are untouched. Titles: "Football: next 7 days" / "Futebol: próximos 7 dias" / "Fútbol: próximos 7 días".

## Provider budget

Diagnostics used database reads and a rolled-back local replay only: **0 OddsPapi and 0 Sportmonks requests** were
spent by the investigation. Automatic ticks after deployment consume the normal routine budget.
