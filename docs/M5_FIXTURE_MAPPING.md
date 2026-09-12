# M5 fixture matching and UTC safeguards

Canonical fixtures/public URLs are owned by Sportmonks-backed LivaSports data. OddsPapi never creates replacement canonical fixtures.

## Safe matching

Only `HIGH_CONFIDENCE` discovery or revalidated `EXACT` persisted mappings may ingest quotes. Discovery requires football, a catalogue-verified tournament mapping, exact normalized full/short names or reviewed explicit aliases, correct home/away roles and a unique candidate within **10 minutes** of UTC kickoff. This tolerance was not enlarged to accommodate the timestamp defect.

Normalization removes accents and punctuation but never strips arbitrary club suffixes or uses fuzzy similarity. Exceptional aliases are scoped in `src/odds/matching.ts`. Learned provider participant IDs and their original names are persisted as reviewable team mappings.

Subsequent runs recheck competition, participant IDs, roles, names and time; a persisted ID does not bypass safety. Multiple provider events claiming one canonical ID, or conflicting persisted team/competition IDs, are rejected. Failed reviews do not publish prices. Once a mapping is established, its exact canonical and provider kickoff are recorded. A change to either requires explicit source reconciliation, even inside discovery tolerance. Reads independently require the recorded canonical kickoff to still equal the fixture timestamp. A reschedule is not silently accepted or repaired using odds.

Review states: EXACT, HIGH_CONFIDENCE, AMBIGUOUS, NO_MATCH, TIME_MISMATCH, TEAM_MISMATCH, COMPETITION_MISMATCH. Each unresolved review has its original evidence and reason. No silent ambiguity resolution.

## Verified kickoff defect, not a global shift

Sportmonks defaults to UTC, but its `starting_at` string may omit a timezone. The former worker parsed that string in the computer's local timezone. The repair prefers `starting_at_timestamp`; a bare documented-UTC string now receives explicit UTC semantics. See official [timezone guide](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/timezone-parameters-on-different-endpoints) and [fixture fields](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures).

Two narrow Sportmonks multi-fixture requests verified 8 then 42 existing IDs. Before the second request, 42 candidates were quantified by competition: 17 Brazil, 18 England, 5 Mexico, 2 Libertadores; observed mismatches were 240, 255 or 300 minutes. Each source row's epoch, UTC string, participant roles and league mapping was checked before correction.

Exactly **50** sampled timestamps were corrected: **46** timezone-only corrections, **4** with an additional source schedule change. Those four are Monterrey–Tigres (+10 minutes beyond the parsing error), Toluca–Atlas (+5), Santos Laguna–Juárez (+60), Cruz Azul–América (+15).

Five fixtures had falsely appeared past kickoff; fresh Sportmonks evidence still classified them scheduled. No live/finished status, scores, canonical ID, public ID or route slug was overwritten. All 904 canonical fixtures remain present. The other **854** fixtures were **not shifted or retrospectively certified**. Future controlled sports ingestion uses the fixed parser.

Corrections are conditional on the exact pre-audit timestamp and stable identity. If another job changed a fixture, the entire batch aborts. Already-correct timestamps are no-ops. Unique DB constraints guard against fixture duplication. The complete before/after audit is in the M5 coverage report and in Sportmonks mapping metadata (`m5KickoffCorrection`).
