# MX CO PE migration release checklist

This branch extends the existing LivaSports product for Mexico, Colombia and Peru. It is not yet released or certified production ready. The last verified Production deployment serves `90d3e13e22cda6cde5225d32a44e20d0ef4404b9`. Do not promote this branch merely because automated tests pass: real jurisdiction-specific provider coverage remains a release prerequisite.

## Shared architecture

`src/config/geo.ts` defines the three commercial GEO profiles, Spanish locale tags, currencies, demand seeds and country context. The canonical competition registry preserves the approved 32 standalone competitions; Saudi Pro League play-offs remain a historical provider child rather than a 33rd standalone league. No subscription or league changes were made in Sportmonks.

The existing Growth engine independently selects at most five eligible future fixtures per country. Shared priorities feed home, competition, team and fixture discovery plus existing SEO Autopilot. First-party HUMAN evidence uses physical GEO and bounded 7/14/28-day windows; country-intent URLs are not proof of a visitor's physical country. Weekly weight adjustments are bounded and recorded. Missing GSC evidence does not authorize an experiment.

Existing media generation remains disabled. Selection jobs do not render videos, generate static assets or synthesize speech. Historical creative revisions, approvals, downloads and publishing records are retained.

## Operator evidence and activation

The candidate registry has four MX operators and five each for CO and PE. Candidates are not active affiliate partners. MX bwin is excluded; a fifth MX candidate has not been invented.

CO legal evidence was checked against the [Coljuegos authorized online operators](https://coljuegos.gov.co/publicaciones/301841/juegosonline/). PE legal evidence was checked against the [MINCETUR authorization registry](https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html), including all five requested operators. Evidence is stored per exact country/operator. This establishes neither affiliate approval nor actual provider coverage. Current MX SEGOB evidence is unresolved because the official service was unavailable during verification.

No country-specific OddsPapi bookmaker ID or source domain has been assumed from a brand name. The current account and bookmaker-catalog requests returned upstream errors or timed out. Pending exact feed verification, all production candidate technical flags remain off. Synthetic `betsson.co` and `betsson.pe` feed identifiers appear only in isolated tests; they are not verified production mappings.

After legal, feed and permitted destination-host verification, the owner uses Commercial Activation to select a GEO/operator, enter the genuinely approved HTTPS URL and campaign, provide an approval reference and explicitly confirm approval. Activation validates server-side and commits campaign/configuration/audit changes atomically with version checks. Ordinary approved campaigns on preverified hosts require no code or deployment. An unfamiliar tracking host still requires deliberate verification; pasting a URL does not make it trusted.

Odds availability is independent of affiliate activation. Canonical slip selections remain unchanged while the eligible price pool differs by country. Missing a leg cannot produce a complete slip price. No BR or other-country price, source or affiliate URL is used as fallback.

## Migration sequence and production safety

Migrations 057–061 have only been applied to an isolated PostgreSQL rehearsal, not Production.

1. `057_geo_commercial.sql` adds country/operator evidence, mappings and audited activation. It also immediately disables BR affiliate campaigns, links and sponsors, including for old workers. Apply only at the deliberate BR commercial cutover, not to prepare an otherwise incomplete Preview.
2. `058_geo_growth.sql` creates GEO-keyed priority state while leaving the old fixture-keyed Growth table and history available to old workers.
3. `059_geo_seo.sql` creates GEO-keyed SEO state and union views for old and new history. Existing SEO daily caps, cooldowns and release accounting remain shared.
4. `060_analytics_geo.sql` extends analytics dimensions and indexes without erasing historical BR events.
5. `061_geo_odds.sql` adds country/source/feed-keyed current prices and history, preserving the legacy BR price tables.

Before applying, inspect production row counts, active transactions and migration state. Use bounded lock and statement timeouts. The constraint rewrites and ordinary analytics index creation are not lock-free; do not run them through an unbounded deployment hook. Apply the schema before promoting code that needs it. Confirm the previous deployment still reads/writes successfully during the transition. Do not delete old rows/tables or use a rollback that resurrects BR promotions.

## Completed local evidence

- Full Vitest suite: 234 files and 2,082 tests passed. The narrow-screen match-header fix additionally passed eight focused tests; no test timeout or assertion was relaxed.
- Typecheck, zero-warning lint, 17 script tests, secret scan and production build passed. Generated public assets were additionally checked against known local secret values with zero matches.
- The isolated PostgreSQL 17.11 rehearsal replayed all 60 migrations and passed 23 named checks plus 13 nested odds assertions. Old Growth/SEO rows remained byte-for-byte intact and old conflict-key writers still succeeded.
- Real SQL assertions verified independent CO/PE prices, stable history identities, monotonic updates, exact-source rejection, no MX borrowing, strict public freshness and separate country health pools.
- A local selection run persisted five synthetic fixtures for each country with zero provider calls or media work. An identical retry added no duplicate history. Owner reads returned five per country.
- Browser QA uses only a disposable local database and clearly QA-prefixed synthetic fixtures. It is not proof of provider coverage or physical-country operator access.

The local-only rehearsal result is kept in ignored `.qa-geo/rehearsal-result.json`. The tracked `scripts/geo-odds-db-qa.ts` exports the database assertions for an explicitly isolated harness. Never point a synthetic-fixture harness at Production. Runtime credentials, disposable session keys and provider responses do not belong in this document or Git.

## Remaining release gates

1. Obtain a working OddsPapi account/catalog response within existing request budgets and cooldowns; verify actual country bookmaker IDs, source domains, entitlements and usable approved-league market coverage. Do not change the subscription.
2. Verify current MX operator authorization against exact official evidence. Select a fifth MX candidate only when both authorization and provider mapping are defensible.
3. Finish secure read-only Sportmonks coverage checks if needed. Authentication and the subscribed catalog were already verified; never place the chat-supplied credential in source, commands, logs or PRs. Any further checks must use a securely supplied environment credential.
4. Finish the final 1440/430/390/320 browser sweep, route crawl, same-slip 1/3/5-selection checks, owner GEO reset and isolated activation tests against the final build.
5. Create a PR and pass CI. Use an isolated Preview data source for migration/fixture QA; do not mutate Production merely to make Preview green.
6. At the planned cutover, apply migrations with bounded locking, backfill verified technical mappings, ingest fresh canonical fixtures/odds, promote the green deployment and run production smoke tests.
7. Verify the Production SHA, all three independent Top 5 lists, scheduler, canonical/hreflang/sitemap, exact-country slip comparison, no BR commercial promotion and disabled social/media generation.

Genuine affiliate approvals and URLs may remain pending, but provider/legal verification and real fresh-odds proof are not interchangeable with affiliate approval. Do not call this migration 99 percent ready while those prerequisites are missing.
