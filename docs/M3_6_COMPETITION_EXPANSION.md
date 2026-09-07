# LivaSports M3.6 — Competition Expansion

## Current checkpoint scope

M3.6 expands the canonical football-data registry to the final 34 approved Sportmonks entries: 29 selected regular competitions, the automatically included Saudi Pro League Play-offs, and the four Euro Club Tournaments bundle competitions. Expensive national-team International Tournaments are deliberately excluded.

The provider boundary remains:

`Sportmonks → coverage validation → canonical mapping → controlled ingestion → Neon/PostgreSQL → M3 cache/service layer → M3.5 fixture UI`

Provider identifiers remain isolated in `provider_entity_mappings`; product URLs and presentation use stable LivaSports slugs. Domestic homonyms are country-gated, normalized names require a confidence threshold, equal-confidence matches are rejected, and one provider competition cannot silently own multiple canonical targets.

## Live updated-subscription result

The authoritative coverage run found all 34 exact mappings: 26 have fixtures in the controlled active window and 8 are accessible but have no current-window fixtures. No target is `NOT_FOUND`, `NO_SUBSCRIPTION_ACCESS`, or ambiguously mapped. Liga MX is provider ID `743`; the Euro bundle maps to IDs `2`, `5`, `2286`, and `1328`.

The exact competition table, provider names/IDs, seasons, fixture counts, and classifications are generated in `output/m3-6-coverage-report.md` and `output/m3-6-coverage-report.json`.

## Persistence and safety

Migration `004_m3_6_competition_registry.sql` is additive and preserves migrations 001–003. It adds localized competition metadata, type/region/group, coverage state, independent BR/MX priorities, season strategy, team type, ingestion metadata, and lookup indexes.

The fixture window remains 7 days past and 21 days future. Navigation remains DB/cache-backed and must not call paid providers. High-cardinality provider normalization is bounded, unchanged mappings skip redundant writes, and team/fixture persistence uses set-based PostgreSQL batches.

## Incomplete checkpoint

The current code and database state are intentionally checkpointed before M3.6 completion. Final team/fixture ingestion, scores, full idempotency, route/cache/mobile QA, and production deployment remain pending. The exact operational state and continuation procedure are in `output/m3-6-checkpoint.md`. M4 must not start until M3.6 is completed and explicitly approved.
