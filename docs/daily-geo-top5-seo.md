# Daily GEO Top 5 SEO operations

The MX, CO and PE daily shortlist now drives the existing compact, server-rendered discovery navigation. Each selected fixture receives links from its GEO home, daily page, competition page and both team profiles. Competition/team navigation contains only relevant selections. The ordinary chronological sports lists and commercial controls keep their existing behavior.

## Ranking and evidence

Eligibility requires an enabled competition, two canonical non-placeholder teams, no pending-fixture quarantine, SCHEDULED status and kickoff within the next seven days. Each GEO ranks independently; no within-GEO duplicates are permitted. The same match can qualify in multiple countries.

Country interest uses the existing cached GSC COUNTRY × PAGE ingestion, filtered by the real searcher country (mex/col/per), across all route languages. Canonical fixture/team identifiers connect historical observations to clubs and competitions. This is measured visibility on LivaSports, not total search volume or betting turnover. Country-query data is not available in this integration; locale-page metrics alone cannot establish searcher country.

The latest complete cached 28-day country window is reused before Google's next ingestion. Country evidence requires at least 50 impressions over seven observed days and a capture no older than 72 hours. An entity requires 20 impressions over three days. Strength is log(1 + impressions + 5 × clicks), normalized within each country's club or league pool. A fixture takes the strongest qualified club/league signal, without summing overlapping signals. Missing, small or stale evidence contributes zero and is labelled explicitly.

Component weights are adjustable in `src/growth/config.ts`: competition 30, clubs 26, verified rivalry 14, stage 10, verified standings 6, timing 8, odds coverage 10, data completeness 4, destination quality 6, reliable first-party intent 24, canonical-page search 3, commercial coverage 3, country search 18. Their maximum is 172 points, not a percentage. Competition/club seeds are editorial priors. First-party demand retains its existing qualification floor; bookmaker coverage is secondary and never represents betting volume. Standings contribute zero when the scorer lacks verified context.

Local affinity uses canonical team country. International fixtures remain eligible. Documented rivalry identity adds match importance, not estimated demand: [MX Clásico Nacional](https://www.chivasdecorazon.com.mx/es/noticias/15705/chivas-manda-en-el-clsico-nacional), [CO Clásico Paisa](https://dimayor.com.co/2025/11/16/atletico-nacional-finalista-de-la-copa-betplay-dimayor-2025/), [PE clásico](https://universitario.pe/noticias/historia/el-clasico-de-los-bastonazos-el-primero-de-la-historia).

## Automatic operation and recovery

The Vercel growth-refresh cron runs at minute 17 of every UTC hour. Every execution fully reranks all eligible candidates independently for MX, CO and PE, including the first execution of each GEO-local day. There is no same-day valid-five shortcut and no Owner approval dependency. Newly discovered stronger candidates, changed qualified country/page search or HUMAN engagement, score-component changes and expired selections can change the Top 5 on that same hourly run. Existing scoring, evidence floors and diversity/quality protections remain unchanged. Started, finished, postponed, cancelled, disabled or quarantined selections are excluded from fresh public priority reads and replaced on the next successful hourly execution.

Stable candidate inputs produce identical rankings and no priority/history rewrites. Only numeric scoring components and real placement facts participate in the fingerprint; countdown prose and capture timestamps do not create SEO churn. Every execution still records its candidate count, current scores, evidence and success/failure. A newer completed check supersedes an older overlapping run, even if the newer result was unchanged.

Migration `071_geo_discovery_refresh.sql` adds two fields and one pending-work index to the existing SEO run ledger. Changed selections atomically queue the union of old and new homepage, daily, competition and team discovery paths. The scheduler invalidates those specific Next.js routes after commit, so cached team pages show current links on their next request. No canonical page is deleted, and no metadata or editorial dates are rewritten. Successful refreshes receive a timestamp; failures leave durable pending work for the next hourly run, even if its ranking is unchanged. No whole-site purge occurs. Already-open browser documents are not pushed new content; navigation/reload retrieves the updated server rendering.

Migration `070_geo_daily_seo.sql` adds only `growth_geo_runs`. It records configuration version, GEO-local date, trigger, status, execution times, automatic checks, candidate counts, complete selected snapshots, scores, reasons and country evidence. The priority write and successful snapshot finish commit atomically. Per-GEO failures do not stop the other countries; partial/failed scheduled executions return HTTP 503. Interrupted RUNNING records older than ten minutes are marked failed on the next execution. Existing stale-run protection and per-GEO persistence locks remain in place.

If the database is temporarily unavailable, public pages remain usable through existing fail-safe reads. They cannot guarantee five new selections until recovery. Country search unavailable/stale falls back to explicit editorial and qualified first-party signals; it does not invent demand. If fewer than five valid fixtures exist, the actual smaller result is recorded and the next automatic check retries. No provider adapter is called by this engine.

Owner Growth displays actual persisted valid selections, last success, last automatic validity check, next hourly check and recent execution snapshots independently for each GEO. The current 28-day GSC fixture metrics preserve missing observations as unavailable; zero is shown only when measured. Organic session/referral counts include HUMAN traffic with search referrers; referral events additionally require a verified server-issued affiliate redirect. No tracking collection or attribution rules change.

## Discovery versus experiments

Daily discovery uses the committed Top 5 and operates independently of `seo_all_pages` experimental publication. The existing compact navigation renders all five on home/daily surfaces and relevant selections on competition/team surfaces. Existing metadata quality gates, HIGH-confidence thresholds, cooldowns, rollback, factual content and sitemap policies remain intact. Daily ranking does not apply speculative title/description rewrites, fabricate freshness dates or create new thin URLs.

## Bounded verification commands

Use the scoped loader with the existing DB-only environment file; never pass provider credentials or run ingestion for SEO verification:

```
node --require ./scripts/tsx-windows-preload.cjs --import ./scripts/geo-top5-preload.mjs --import tsx scripts/geo-top5-cli.ts plan --db-env <existing-env-path> --output <plan.json>
node --require ./scripts/tsx-windows-preload.cjs --import ./scripts/geo-top5-preload.mjs --import tsx scripts/geo-top5-cli.ts migrate-plan --db-env <existing-env-path> --output <rollback-proof.json>
node --require ./scripts/tsx-windows-preload.cjs --import ./scripts/geo-top5-preload.mjs --import tsx scripts/geo-top5-cli.ts migrate --apply --db-env <existing-env-path> --output <migration.json>
node --require ./scripts/tsx-windows-preload.cjs --import ./scripts/geo-top5-preload.mjs --import tsx scripts/geo-top5-cli.ts repeat --apply --db-env <existing-env-path> --output <execution.json>
node --require ./scripts/tsx-windows-preload.cjs --import ./scripts/geo-top5-preload.mjs --import tsx scripts/geo-top5-cli.ts report --db-env <existing-env-path> --output <report.json>
node --require ./scripts/tsx-windows-preload.cjs --import tsx scripts/seo-top5-check.ts <report.json> > <http-proof.json>
```

`plan` and `report` are read-only. `migrate-plan` performs a transactional production-data rehearsal, including full run/repeat/automatic checks, then rolls back all schema/row changes. Live migration/run require `--apply`. Migration is restricted to 071 with expected baseline 070/071. HTTP checks are bounded, use public pages only, and distinguish HTTP indexability from actual Google indexing. Observe the next real scheduler execution and discovery receipt without manually impersonating a cron tick. CLI ranking is diagnostic; pending cache work is drained by the production scheduler/Owner route, not by a local Next.js-less process.

## 30/60/90-day measurement

- 30 days: inspect daily successful snapshots and all five placements per GEO; investigate stale selections or missing anchors; compare selected-page impressions/clicks, country evidence, HUMAN organic sessions and verified referrals. Inspect representative URLs in Search Console and retain actual index/crawl outcomes. Keep crawl/canonical/hreflang/sitemap defects at zero. Promotion is not proof of Google indexing or causal growth.
- 60 days: compare equal completed 28-day windows and selection cohorts, accounting for fixture expiry and tournament schedules. Use actual country/entity queries if the integration gains them. Adjust one documented weight/threshold at a time only after sufficient observations; keep sparse CO/PE rankings explicitly provisional. Metadata experiments continue under existing confidence/cooldown protections.
- 90 days: retain demonstrated discovery and engagement winners, review route cannibalization and retired fixture index policy, and expand only competitions/clubs with measured evidence and adequate fixture quality. Report actual changes and uncertainty; do not promise traffic or revenue targets unsupported by baseline data.
