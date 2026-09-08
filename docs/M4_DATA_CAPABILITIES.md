# LivaSports M4 — Data Capabilities

## Controlled evidence

Five canonical fixtures were enriched across Brasileirão Série A, Liga MX, Premier League, Copa do Brasil, and Copa Libertadores. Four were finished rich-data samples and one was a real scheduled sample. The persisted result is 32 score components, 70 events, 330 statistics, 174 lineup rows, 8 formations, 90 standings rows, and 30 module-state records.

The validation used documented Sportmonks fixture includes and season standings. A separate controlled H2H probe returned six real fixture records. Nothing in this matrix is inferred from endpoint names alone.

| Capability | State | Actual evidence / product behavior |
|---|---|---|
| Fixture identity and schedule | SUPPORTED | 904 canonical fixtures; all have stable LivaSports public IDs. |
| Participants/home-away roles | SUPPORTED | Explicit `meta.location` roles required; array order is rejected. |
| Scheduled state | SUPPORTED | Real scheduled Libertadores page; pending modules are explicit. |
| Finished score | SUPPORTED | Real BR/MX/PL/cup final samples; canonical current score persisted. |
| Live state | PARTIAL | Model, stale handling, internal polling, and a labeled historical replay are tested. No real production live match was observed. |
| Score components | SUPPORTED | Current, penalties, extra-time, and aggregate rows remain distinct when present. |
| Events/timeline | SUPPORTED | 70 real persisted events; minutes, stoppage time, team/player, result, rescinded flag. |
| Detailed statistics | SUPPORTED | 330 real persisted rows; complete localized rendered list. |
| Lineups | SUPPORTED | 174 players across four rich fixtures; starters and substitutes. |
| Formations | SUPPORTED | 8 real formation rows. |
| Coaches | PARTIAL | Include is accepted, but the controlled responses produced zero usable named coach rows. UI does not invent names. |
| Venue/round/stage/season | SUPPORTED | Real values persisted where present; missing values remain empty. |
| Standings | SUPPORTED / N/A | 90 rows across four applicable competition samples. Copa do Brasil is explicitly `NOT_APPLICABLE`. |
| Recent form | PARTIAL | Uses bounded finished fixtures in the controlled Neon window; displayed sample count is explicit. |
| Head-to-head | PARTIAL | Provider endpoint returned real data, while ordinary UI uses bounded stored history to keep provider requests at zero. Full historical depth requires a later controlled backfill. |
| Pregame odds module | SUPPORTED BOUNDARY / NO ELIGIBLE SAMPLE | Reads only fresh persisted quotes verified for the route GEO. M4 made zero OddsPapi requests. |
| Live odds | NOT AVAILABLE IN CURRENT PLAN | Explicitly excluded; never requested or presented. |

## Accuracy controls

- Home/away mappings require explicit provider role metadata.
- Unknown provider state falls back conservatively to scheduled; no score is synthesized.
- Missing numbers remain `null`; real zero is preserved.
- A total-market selection identity includes fixture, period, market, outcome, exact line, and settlement scope.
- Event/stat/lineup/score persistence keys are provider record IDs scoped by canonical fixture.
- Standings identity includes season, stage, group, and team.
- Stored provider timestamps and snapshot timestamps are separate.

## Limitations

- M4 enrichment is deliberately a five-fixture controlled sample, not a full 904-fixture detail backfill.
- Coach names were not present in the verified response shape.
- Full historical H2H depth is not yet ingested.
- The database contains 134 unmaterialized Sportmonks identity reservations (129 season, 5 fixture). They are created by the earlier M3.6 normalize-before-filter flow, are not referenced by product rows, and are not relational orphans. No M4 table or canonical competition/season/team/fixture points to a missing parent.
- Real live behavior was not observed; the replay route is development-only and explicitly labeled.

## Provider documentation

- [Fixtures and includes](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures)
- [Participants](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/participants)
- [Scores](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/scores)
- [Lineups](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/lineups)
- [H2H](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-head-to-head)

