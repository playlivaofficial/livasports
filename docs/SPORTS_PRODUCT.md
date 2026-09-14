# Football product and coverage

The existing BR, MX, and EN football URLs now expose competition overview, fixtures, results, standings, scorers, and teams. Competition identity stays in the existing `competition` query parameter. Optional `season`, `tab`, and `p` parameters preserve navigation without introducing duplicate competition routes.

All public loaders read PostgreSQL or the server cache. Navigation, language switching, search, and browser refreshes do not call a sports provider. The existing commercial, odds, slip, and scheduler systems retain their separate responsibilities.

## Stored sports data

The additive sports migrations are `016_sports_competition_depth.sql`, `017_sports_pending_draws.sql`, `018_sports_pending_participants.sql`, `019_sports_unlinked_lineup_statistics.sql`, and `020_sports_unlinked_competition_records.sql`. The sports CLI applies only these migrations, checking the migration ledger in a transaction. It does not apply commercial migrations.

Provider snapshots populate the existing match/profile tables plus season capability records, official scorers, and pending fixtures. A pending fixture retains its canonical identity until confirmed participants exist. Pending draws are labelled explicitly and excluded from normal match sitemaps. No substitute teams, scores, standings, or rankings are generated.

Fixtures and results have bounded pagination across the selected season. Team results and fixtures can be filtered by season. Squads retain their actual season and competition context. Standings show official qualification metadata and home/away splits only when supplied; missing values are shown as unavailable. Scorer rankings use real positive goal totals with assists, appearances, and minutes where recorded.

If the provider-designated default season has no fixtures and all six capabilities are verified empty, the competition opens on its latest populated season with a visible explanation. The empty season remains selectable. An explicit season request is never replaced, and incomplete ingestion cannot trigger this fallback.

The existing score ticker can persist match detail includes from its already-counted sports request. Its cadence, budget, and request ledger are unchanged. Standings, season totals, and squad snapshots are refreshed separately by the backend sports CLI; opening a page never refreshes them at the provider.

## Backend commands

Run from the repository with the existing private local environment configured:

```text
npm run sync:sports -- rehearse
npm run sync:sports -- migrate
npm run sync:sports -- populate
npm run sync:sports -- enrich
npm run sync:sports -- refresh-current
npm run qa:sports:db
```

`rehearse` checks cached real fixture examples inside a transaction and rolls back. `migrate` applies the five sports migrations once. `populate` imports all provider-exposed seasons for the 34 enabled competitions, resuming completed work from private checkpoints. `enrich` fills coach/participant metadata from captured responses without replacing match scores. `refresh-current` deliberately fetches fresh current-season snapshots; its checkpoint file is separate from the historical import.

Population uses three bounded workers and bulk database batches. Every attempted provider request is recorded before HTTP. Season-specific parser or storage errors are recorded in private per-run failure reports while other safe seasons continue. Shared storage failures and provider authentication, rate-limit or service errors stop the run without discarding completed checkpoints. Storage headroom is checked before further population. Run only one population or refresh command at a time.

The importer retains the provider's per-entity rate-limit metadata, including the actual limit header, remaining requests and reset time. It does not assume that all requests share one account-wide window. Known exhausted windows and HTTP 429 responses prevent further upstream work. See the [official Sportmonks rate-limit documentation](https://docs.sportmonks.com/v3/api/rate-limit).

`qa:sports:db` uses a database-enforced, repeatable-read, read-only transaction. It checks all 34 competition read models, history pagination, search, profile score consistency, H2H boundaries, event chronology, dismissal counts, and sitemap batches. It makes no provider requests. Its dedicated CLI shim handles the `server-only` sentinel only for this QA entry point; production enforcement remains intact.

The full source-to-storage audit can be run after population:

```text
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.local scripts/sports-coverage-qa.ts
```

It compares captured provider identities against persisted records for every catalogued season and produces the 34-competition matrix. Incomplete ingestion or uncaptured source pages remain failures, rather than being reclassified as unsupported coverage. Existing odds counts are reported from storage only.

After a complete historical audit, `scripts/sports-coverage-qa.ts --current-only` can verify a subsequent current-season refresh without repeating unchanged historical checks. It writes a separate report explicitly scoped to current seasons and marks which competition rows were included. This report alone is not evidence for all historical seasons; retain the complete audit alongside it. Both modes enforce a read-only database transaction and make zero provider calls.

The report distinguishes catalogued seasons, completed capability checks, and seasons containing actual persisted records. A verified empty response or HTTP 403/404 is reported explicitly; it is not counted as a populated season merely because its catalogue entry exists. Current and historical totals remain separate.

Historical round, group, event, and team-statistic names are checked against the same localization maps used by the public pages. Match statistic terminology follows the [official fixture-statistics definitions](https://docs.sportmonks.com/v3/definitions/types/statistics/fixture-statistics). A historical match's competition link retains its actual season ID.

The squad selector stores its independent `squadSeason` in the URL. Team-history pagination and language changes preserve it without replacing the separate results/fixtures season filter. Newly imported season contexts become visible after the bounded profile cache refresh.

The event timeline labels the known team, incoming and outgoing substitutes, and supplied goal assists in all three languages. Role mapping follows the [official Sportmonks event documentation](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/events): the primary substitution player enters and the related player leaves. Unknown identities do not become fabricated links.

Contradictory provider associations are recorded separately as source conflicts. For example, a coach attached to neither participant in a fixture is retained in the captured source audit and excluded from the team association; it is never reassigned by name or proximity. The audit also fails if a persisted coach points to a different team from the fixture participants.

The same exact-participant rule applies to lineups and their player statistics. In two captured 2010/11 Champions League matches, 32 lineup entries and 55 associated statistics reference a club that is neither match participant. These source conflicts remain in the private captures and audit report, without a guessed club reassignment. Source-to-storage checks distinguish these contradictions from repairable missing data and fail on any invalid persisted association.

When a lineup entry has no global player identity, its official statistics remain attached to its provider lineup ID. The match can display those statistics without inventing a player profile or merging people with the same name. The offline `scripts/sports-detail-repair.ts` command fills such previously omitted details from captured responses after population; it makes no provider requests, overwrites no scores, and removes only team associations that contradict the fixture participants.

Audit responses, progress logs, and checkpoint files under `output/sports-*` are private ignored working artifacts. They are not client assets or Git content. Credentials stay in the existing server environment.

Provider captures use lossless gzip compression; readers also accept preserved plain JSON captures. `scripts/sports-compress-captures.ts` converts existing captures only after verifying an exact byte-for-byte round trip for each replacement. Pause older plain-file importers/readers before conversion, then resume the existing import checkpoint. The conversion does not make provider requests or change imported database records.

## Search discovery

`/sitemap.xml` retains the main locale and competition entry points with a small entity sample. `/sports-sitemaps.xml` discovers the complete stored match, team, and player catalogue through batches of 500 entities (1,500 localized URLs per batch). Production robots lists both entry points. Each entity has reciprocal PT-BR, ES-MX, English, and English `x-default` links. Invalid batch URLs return 404; database failures return 503 with a retry interval rather than an empty successful index.

## Time preferences and informational pages

The server reads validated first-party time preferences before selecting date boundaries. Brazil defaults to São Paulo, Mexico to Mexico City, and English uses the browser time zone after one bounded detection, with UTC as its initial fallback. A manual choice overrides those defaults in every language. The HttpOnly preference lasts up to a year; detected device time lasts seven days. A session flag prevents reload loops if cookies are blocked. Time preferences neither modify commercial GEO nor touch guest-slip storage. Sports lists, competition histories, profiles, pending fixtures, and Match Center use the same resolved zone; date-range tests cover UTC+14, UTC−11 and DST transitions.

Twelve localized informational pages explain responsible gambling, affiliate disclosure, terms, and the actual current data handling. Footer links, language switching, canonical URLs, hreflang and sitemap discovery include these pages. No operator destination appears in the safety-resource links.

Official sources reviewed on 14 September 2026:

- [Ministry of Finance: July 2026 advertising changes](https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/ministerio-da-fazenda-amplia-exigencias-de-publicidade-de-apostas-no-pais): references Portaria 1.964/2026 and Interministerial 73/2026. It specifies prescribed horizontal warning wording occupying at least 10% of an advertisement, effective 17 July. The linked DOU full texts returned HTTP 502 during this review.
- [Official self-exclusion service](https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/autoexclusao).
- [Ministry of Health: prevention and harm reduction](https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-mental/nao-aposte-sua-saude/prevencao-e-reducao-de-danos).

These informational changes do not certify legal compliance. Existing commercial delivery is preserved. Advertisement-specific warning layout and operator-authorization review remain separate commercial work; a footer is not a substitute for the warning requirements on individual advertisements. The notice does not invent a corporate controller identity, legal contact address, consent interface, retention guarantee or automated erasure service that the product does not provide.

Match structured data uses [Schema.org event-status values](https://schema.org/EventStatusType) only where the stored status has a matching enum, with factual venue information and a season-specific competition breadcrumb in all three languages. No broadcaster, ticket offer, end time or event attendance information is invented. Match metadata includes the stored kickoff in a stable locale timezone. Existing readable name plus immutable public-ID routes are preserved.

Competition links use full document navigation through `SportsLink`. In the installed Next.js 16.3 production build, client navigation between football query variants reused generic football metadata despite correct competition content; request-boundary and dynamic-route settings did not resolve the observed behavior. The scoped document navigation keeps title, canonical and reciprocal language links tied to the actual competition/season. Match and profile links retain framework navigation. Server read-model caching, first-party preferences and persisted guest state remain separate from this navigation choice.

## Release gates

Run the full test suite, typecheck, lint, production build, secret scan, database QA, existing read-only commercial QA, and publisher rollback QA. Verify the source-to-storage matrix after population finishes, then check real competition, match, team, and player pages in all three interface languages at 375, 390, 430, 768, 1024, and 1440 pixels. Provider absence and unfinished ingestion must remain distinguishable in the final coverage report.

## Historical source associations

Migration 020 preserves official standings and scorer records when Sportmonks returns a participant/player ID without the associated entity. These records retain the source payload and known canonical associations separately; no placeholder team or player profile is invented. The competition read model includes their real totals and explicitly labels unavailable identities. Exact source-to-storage QA includes this storage and verifies its payload equality. `npm run qa:sports:unlinked` rehearses representative records and idempotency entirely in a rollback transaction with zero provider calls.

Player profiles also use stored official scorer totals when the corresponding season-statistics value is missing. A verified value, including zero, takes precedence; different season/team contexts remain separate.

If an authorized `refresh-current` run is interrupted, resume it with `refresh-current --resume-refresh`. It keeps its separate refresh checkpoint and never replaces the historical import checkpoint. Completed team/squad units are read from their captured evidence without repeat provider requests or database writes; a missing completed capture fails explicitly. A new deliberate `refresh-current` run starts a fresh current-season refresh.
