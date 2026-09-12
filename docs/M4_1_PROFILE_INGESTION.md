# LivaSports M4.1 — Profile Ingestion and Recovery

## Additive schema

Migration `007_m4_1_team_player_profiles.sql` adds:

- stable unique `teams.public_id` values and optional team profile metadata;
- canonical `players` and unique `player_provider_mappings`;
- season-scoped squad memberships;
- team-season, player-season, and fixture-player statistics;
- links from existing M4 lineups/events to canonical players;
- reusable provider statistic types;
- per-entity/module profile freshness state;
- leased, resumable profile sync jobs;
- disabled-by-default sponsor campaign/event contracts.

The migration is recorded by the existing `schema_migrations` runner. Its verification re-run applied no migrations. No M3/M4 table was dropped or rebuilt.

## Identity and constraints

- team public ID: unique and persisted;
- player public ID: unique and persisted;
- provider player mapping: unique by provider/provider-player and provider/canonical-player;
- squad membership: unique by team/season/player;
- team statistic: unique by team/season/type;
- player statistic: unique by player/team/season/type;
- fixture statistic: unique by fixture/player/type.

Provider corrections update the keyed row. One player moving clubs remains one canonical player with separate season/team contexts.

## Controlled rollout

The measured estate before broad enrichment is:

- 1,343 canonical teams and stable team public IDs;
- 1,343 teams in current seasons;
- 634 teams with a fixture within the current ±90-day relevance window.

A blind full-squad/player-detail import was deliberately rejected. The controlled sample targeted Flamengo, América, and Fulham using existing mappings. Each run used a strict 20-request adapter ceiling and completed in 13 Sportmonks requests.

Persisted sample coverage:

| Team | Squad memberships | Team statistic rows |
|---|---:|---:|
| Flamengo | 37 | 43 |
| América | 34 | 41 |
| Fulham | 28 | 38 |
| **Total** | **99** | **122** |

Four representative player details produced 26 player-season statistic rows. Existing M4 fixture lineups/statistics were linked without additional provider calls, yielding 253 canonical players, 174 lineup links, 69 event links, and 131 fixture-player statistic rows.

## Request accounting

| Stage | Sportmonks | OddsPapi |
|---|---:|---:|
| Capability audit and two-request recovery | 15 | 0 |
| First controlled sync | 13 | 0 |
| Corrected controlled sync | 13 | 0 |
| Second identical idempotency run | 13 | 0 |
| **Exact M4.1 total** | **54** | **0** |

The DB-only fixture-player linking command ran twice with zero provider requests. No full M3.6 re-ingestion occurred.

## Idempotency and integrity

The final identical controlled run completed 3/3 targets, inserted 0 records, and updated 238 keyed records. Final duplicate counts are zero for team public IDs, player public IDs, player mappings, squad memberships, team statistics, player statistics, and fixture-player statistics. All M4.1 relational orphan counts are zero.

Active jobs: 0. Stale jobs: 0. Two duplicate player display-name groups are expected and remain distinct through canonical public/provider identities.

## Recovery model

The sync uses a single active lease, heartbeat, durable target cursor, processed/total counters, request count, inserted/updated counters, and sanitized error text. An expired job is marked failed before a new lease starts. Targets are processed sequentially with short module writes; failure on one entity does not delete valid sibling modules.

Normal route loads never construct the profile provider adapter and never perform enrichment.

## Next safe backfill step

Any wider backfill should remain a separately approved, bounded job prioritized by current Brazil, Liga MX, major European, and continental relevance. Estimate requests before each batch, retain lease/resume behavior, and do not run a provider request per page view or per rendered row.
