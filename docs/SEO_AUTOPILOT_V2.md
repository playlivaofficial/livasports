# Traffic Engine V2 — SEO Autopilot

## Architecture and preserved boundaries

V2 enriches **existing canonical product URLs**, not parallel articles or keyword variants. The original V1 SEO Top 10 / Social Top 5 remains independently configured. No social rendering, asset, posting-state, odds, provider scheduler, affiliate, GEO, auth or user-data writes are performed by V2.

`src/seo-autopilot/` contains deterministic policy, DB inventory, bounded orchestration, rendered-HTML audits, GSC sitemap management, weekly feedback, factual PT-BR content and the protected dashboard. Migration 051 adds six SEO-only tables. Existing `/sitemap.xml` and `/sports-sitemaps.xml` paths are preserved.

## Opportunity score

Maximum 100, using existing club/competition editorial configuration:

| Component | Maximum |
| --- | ---: |
| Club priority | 20 |
| Competition priority | 18 |
| Verified Brazilian competition/participant | 15 |
| Configured rivalry | 8 |
| Recorded knockout stage | 5 |
| Kickoff proximity | 8 |
| Observed page / related-entity GSC impressions, logarithmic | 10 |
| Distinct persisted factual modules | 6 |
| Source freshness | 3 |
| V1 shortlist | 3 |
| Verified inbound sources | 4 |
| Weekly cluster boost | 5 |

The sum is capped at 100. Tier A >=72, B >=52, C below52. This is editorial prioritization, **not search-volume estimation or predicted traffic**. Missing GSC evidence contributes zero, never invented volume. The owner sees components and reasons in persisted decision evidence.

## Publish policy

AutoPublish is enabled. A qualifying fixture must pass source freshness, >=3 distinct fact signals, actual HTTP200, populated server HTML, self-canonical, index/follow, matching PT-BR alternate, valid parsed structured data, >=2 rendered inbound sources, supported sitemap window/retained value, and stable scheduled/finished state. Low quality, missing evidence and failures fail closed.

States: PUBLISHED, PRODUCT_ONLY, BLOCKED, NOINDEX, RETRYABLE_DATA_GAP. These are **SEO enrichment states**, not route creation/deletion. Existing routes remain available. Tier C/noindex decisions leave the submitted fixture inventory; no valid product route is deleted. A failed gate never grants indexing to a previously nonindexable page. Existing retired pages are not broadly resurrected.

Only an otherwise-qualified page missing inbound links can stage contextual product links from its team/competition hubs. It remains unpromoted until the actual rendered anchors pass a subsequent check. Links are HTML anchors, never script-only href strings. Related fixtures stay within the same teams/competition and are capped; no footer link farm.

## Fact and lifecycle safety

PT-BR copy uses the current Match Center read model: real kickoff/venue, finished scores, verified recent results and available H2H. Unavailable/stale modules are omitted; no injury, broadcast, expected lineup or prediction is invented. Historical form is explicitly a sample of available records, not a complete history. Live/moved states do not receive an unsupported live promise.

Metadata changes are limited to a factual template and <=2 initial activations/day; existing controlled CTR experiments are excluded. Subsequent state-dependent wording reads the same facts as the visible page. Pages with measured GSC value can retain indexability beyond the prior finished-match age window, with matching BR/MX/EN metadata and sitemap treatment. No redirects or deletions based solely on zero clicks.

## Sitemaps and GSC

Existing daily technical/GSC sync remains 05:40 UTC. The read client remains read-only by default. Sitemap submission alone requests `webmasters` authorization using the existing service account, or uses an OAuth token already granted that scope. A missing write grant is reported as a one-time setup requirement; it is not bypassed or silently treated as submitted.

Two exact sitemap roots are allowlisted. The worker hashes normalized URL/lastmod content, including child batches, stores content/submission hashes separately, never resubmits unchanged content, and backs off failed submissions for at least24hours. No Indexing API, ping endpoint or manual per-page request workflow.

Managed fixture lastmod is driven by a stable source-content fingerprint, not polling/build/score changes. Unverified ingestion timestamps are omitted for other fixtures, teams and competition hubs; reviewed static-document dates remain. Sitemap submissions improve discovery, **not guaranteed indexing**. Indexed-URL count remains unavailable rather than fabricated.

## Scheduling, caps and recovery

- SEO Autopilot: daily07:10UTC, after GSC and authority refresh.
- Weekly feedback: first successful daily run each ISO week; bounded absolute boost0..5, not compounding, old/new audit records. No core-weight rewrite.
- <=500 inventory candidates, <=12 evaluations/run, <=5 first promotions/day, <=10 significant content refreshes/day, <=2 metadata activations/day.
- Existing-page lifecycle slots are reserved. Publication/title/content counters persist across retries.
- Global transaction-advisory acquisition +10-minute lease; stale runs become INTERRUPTED. Preview cron blocked; scheduler requires existing CRON authorization and rejects query parameters.
- Own-site crawls timeout and deduplicate shared URLs. No sports-provider requests. Exceptions expose sanitized codes only.

## Measurement and dashboard

`/owner/growth/autopilot` uses existing owner authentication and noindex. 7/28/90-day views expose observed-day counts, clicks/impressions/CTR/weighted position, disclosed non-brand queries, Top10/20, organic HUMAN sessions and commercial-intent/outbound sessions. QA/OWNER/BOT traffic is excluded. First impressions, decisions, blocked reasons, technical issues, sitemap state and cluster evidence remain auditable. Existing full funnel and CTR experiment reports remain linked.

Historical windows remain incomplete until genuine data accrues. Query anonymization prevents complete non-brand totals. Position and CTR detectors are heuristics; neither publication nor tiny-sample changes prove causality. Zero-value handling requires 90 days and 28 observed GSC days: at most five aged pages are evaluated per run. Strategic pages and pages with historical clicks are retained; genuinely low-value entries leave the sitemap without deleting their product routes or data. Every decision is recorded.

## Release / recovery commands

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run secret:scan`.

Scoped CLI (credential values never arguments/output):

```sh
node --import ./scripts/seo-autopilot-preload.mjs --import tsx scripts/seo-autopilot-cli.ts plan --db-env <private-env-path>
node --import ./scripts/seo-autopilot-preload.mjs --import tsx scripts/seo-autopilot-cli.ts migrate --db-env <private-env-path>
node --import ./scripts/seo-autopilot-preload.mjs --import tsx scripts/seo-autopilot-cli.ts report --db-env <private-env-path>
```

`plan` validates schema in a rolled-back transaction and performs read-only scoring. Migration mode rejects an unexpected baseline, uses the normal migration runner, then repeats to prove no pending migration. No sports ingestion is run. Apply051 before serving the new sitemap query. Roll back code if needed; additive SEO tables may remain without impacting previous code. Set centralized `enabled/autoPublish` false in a reviewed release to stop future automation; original product/V1 continues.

## Official references

- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Significant lastmod changes](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping)
- [Sitemaps submit API](https://developers.google.com/webmaster-tools/v1/sitemaps/submit)
- [Scaled content abuse policy](https://developers.google.com/search/docs/essentials/spam-policies)

Release SHA, controlled production outcomes and observed shortlist belong in the release evidence report; this document does not claim an unverified deployment.
