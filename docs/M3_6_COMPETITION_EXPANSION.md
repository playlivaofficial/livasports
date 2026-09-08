# LivaSports M3.6 — Competition Expansion

## Scope

M3.6 expands the canonical football-data registry to the final 34 approved Sportmonks entries: 29 selected regular competitions, the automatically included Saudi Pro League Play-offs, and four Euro Club Tournaments bundle competitions. National-team competitions that require the separate International Tournaments package remain excluded.

The production boundary remains:

`Sportmonks → explicit coverage validation → canonical mapping → controlled ingestion → Neon/PostgreSQL → M3 cache/service layer → M3.5 fixture UI`

Provider identifiers are isolated in `provider_entity_mappings`. Product URLs and presentation use stable LivaSports slugs. Domestic homonyms are country-gated, normalized names require a confidence threshold, equal-confidence matches are rejected, and one provider competition cannot silently own multiple canonical targets.

## Updated-subscription coverage

The live coverage pass discovered all 34 exact mappings: 26 had fixtures in the controlled active window and eight were accessible but had no fixture sample. No target was missing, inaccessible, or ambiguous. Liga MX is provider ID `743`; the Euro bundle maps to Champions League `2`, Europa League `5`, Europa Conference League `2286`, and UEFA Super Cup `1328`.

The authoritative mapping table and provider evidence are in `output/m3-6-coverage-report.md` and `output/m3-6-coverage-report.json`. The older 10/30 result is stale and must not be used.

## Persistence model

Migration `004_m3_6_competition_registry.sql` adds localized metadata, competition type/region/group, coverage state, independent BR/MX priority, season strategy, team type, ingestion metadata, and lookup indexes. Migration `005_m3_6_remove_orphan_country_mappings.sql` removes only Sportmonks country mappings whose referenced canonical country row does not exist.

High-cardinality ingestion uses:

- bounded provider normalization;
- cached sport bindings;
- canonical team-country resolution by unique ISO2;
- set-based team and fixture upserts;
- skipped writes for unchanged provider mappings;
- explicit target filtering for safe resumable stage execution;
- stale-run recovery for abandoned sync rows.

The fixture window remains seven days past through 21 days future. Accessible competitions with no rows in that window use `SUPPORTED_BUT_NO_CURRENT_FIXTURES`; an empty competition never aborts another target.

## Final state and integrity

Neon contains 34 enabled competitions, 42 seasons, 33 current seasons, 1,343 unique teams, 904 fixtures, and 2,484 provider mappings. All competition, season, team, fixture, provider-reference, and internal-mapping duplicate-group audits return zero. Every stored team and fixture has its Sportmonks mapping, and no orphan Sportmonks country mapping remains.

The second controlled idempotency pass inserted zero teams and zero fixtures. Scores updated the same 50 fixture rows without creating entities. Exact per-competition counts, request accounting, recovery detail, and release evidence are in `output/m3-6-report.md`.

## Runtime protection

Ordinary navigation remains DB/cache-backed. No route performs a Sportmonks or OddsPapi request. M3 L1/L2 caching, concurrent deduplication, stale fallback, explicit-column DB reads, tag invalidation, health diagnostics, and zero-provider-navigation observability remain unchanged.

M3.6 changes the available canonical competition data; it does not redesign the M3.5 interface or add M4 product features.

## Operational continuation

Future refreshes should use the existing scheduled/stage commands and reuse current provider mappings. Coverage discovery should run only when the approved set or provider subscription changes. A no-current-fixture target should be retried in its own seasonal window without forcing a full 34-competition bootstrap.

M3.6 must be explicitly approved before any M4 work begins.
