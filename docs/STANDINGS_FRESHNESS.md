# Standings freshness incident — 2026-10-01

## Proven scope and cause

Production baseline `0f47cb8da12dd52db2c64d8384cd364d6fc27dc2` was verified via `/api/internal/health` and Vercel Ready. Seven authoritative Sportmonks season calls found differing played/points/rank in all 134 audited rows across Premier League, Brazil Série A, La Liga, Serie A Italy, Bundesliga, Ligue 1 and Liga Portugal. DB snapshots were last observed September 14; public tables had the same row counts. Lag is not uniformly one game: Barcelona was two games behind.

| Example | Stored played / points / rank | Provider played / points / rank |
| --- | --- | --- |
| Manchester City | 4 / 12 / 2 | 5 / 15 / 1 |
| Flamengo | 27 / 57 / 1 | 28 / 60 / 1 |
| Barcelona | 5 / 15 / 1 | 7 / 21 / 1 |

Result ingestion updated fixtures/details and invalidated fixture tags, but never queued standings. The declared M4 30-minute policy was not an executing job. Standings were written only by manual ingestion. No standings cron existed. Thus upstream was ahead of DB, not merely a frontend caching issue. Competition hub cached reads for 60 seconds; Match Center cached standings per fixture for 600 seconds, without a standings invalidation path. There was no public standings JSON endpoint; the previous match API exposes header/status, not table rows.

## Durable design

- Additive/idempotent migration 054 creates per-season refresh state and bounded attempt accounting. It preserves existing standings and seeds their real old observation timestamps, never inventing fresh timestamps.
- Transactional fixture trigger marks old/new affected season dirty for completed insert, final score correction, completed status reversal, participant/group/stage/season change. Duplicate writes and changes to kickoff alone do not increment dirty state. Scheduled-to-scheduled reschedules do not trigger unnecessary standings calls.
- Dedicated authenticated sports cron runs every five minutes, offset two minutes; no odds scheduler change. Five-minute settlement delay; maximum three season requests per tick, 48/hour, 192/UTC day. The initial 24/hour protection was increased to 48 after rollout demonstrated it would unnecessarily defer part of the 33-current-season recovery; the provider reported 2,499 Standing requests remaining. Automated five-minute ticks still cannot exceed 36/hour; normal safety cost remains unchanged. Per-season dirty versions prevent an in-flight result from being cleared by an earlier refresh.
- Successful dirty refresh gets a 20-minute settlement follow-up, then 12-hour safety refresh. Safety baseline is at most 68 requests/day for 34 current seasons, normally less; affected-result batches add one refresh plus one follow-up. The hard ceiling includes failures. No provider call is performed from public navigation.
- Unchanged responses while dirty remain pending, with 5m, 15m, 1h, 6h, 12h backoff. 401/403/404 get 24h per-season cooldown; 429 gets at least one hour. Shared auth/quota failure stops the batch and adds a one-hour global cooldown. 5xx/network failure stops the batch, retaining good data. No in-request retries.
- A changed source revision that still predates the latest persisted completed result remains pending too (fixture provider timestamp, or kickoff + 90 minutes when unavailable). No source timestamp is fabricated; newer valid partial progress can be retained while settlement remains explicitly pending.
- Provider season `standings_recalculated_at` is included and interpreted in UTC; absent source timestamps remain null. Full season snapshots are validated before atomic table replacement. Snapshot fetch ordering, provider revision ordering, hash, played-count metrics and row identity are checked. Empty or unversioned regressing responses cannot erase a good table. A positively newer provider revision may legitimately contain deductions/rescissions.
- Both historical manual writers share the same protected persistence. Season/competition mapping must match exactly; existing unlinked official rows remain supported.
- Immediate targeted tag expiry plus a DB revision in the hub cache key prevents stale process-local caches on other instances. Match Center reads the small standings table directly from DB, preserving zero provider calls. Public `/api/sports/standings/[slug]` uses the same hub read model and returns no-store JSON with freshness metadata. Owner health reports dirty/error/age/version and quota, without calling a provider.

## Operational limits and rollout

Run all tests, typecheck, lint, build, secret scan; rehearse migration twice and ingestion/trigger scenarios inside a rolled-back DB transaction. Apply 054 with the existing migration runner before preview/production activation, then normal PR/CI/Vercel release. Seed refresh is bounded by the same worker and quotas; do not run full fixture/season ingestion.

Initial audit consumed 7 successful season requests plus 1 rejected attempt using an older local credential; no retry storm or credential exposure. Provider responses are private ignored audit artifacts, not committed fixtures. Production acceptance must compare upstream/DB/API/rendered rows for at least PL, Brazil and La Liga and observe the actual cron before claiming automatic operation.

Source-delayed data can remain pending; it is never fabricated. Seasons without applicable standings remain empty. Hard limits defer work on exceptionally busy days. An external provider can still publish incorrect data; this system protects ordering and provenance, not sporting adjudication.

Official source semantics: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/standings/get-standings-by-season-id (full season endpoint, no pagination); season metadata includes `standings_recalculated_at`.
