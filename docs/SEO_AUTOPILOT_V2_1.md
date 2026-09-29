# SEO Autopilot V2.1 — Growth Optimization Loop

## Architecture and boundaries

The existing 05:40 UTC `seo-refresh` task ingests final Search Console totals and genuine page/query, page/country and page/device reports. The existing 07:10 UTC `seo-autopilot` task reads that persisted evidence under its existing exclusive run lease, evaluates optimization, then continues the V2 publisher, technical crawl and sitemap hash/dedup/backoff flow. No second GSC ingestion job, new public scheduler, provider call, social render or publishing endpoint is introduced.

`optimization-data.ts` performs bounded-window bulk reads, canonical entity joins and independent dimension aggregation. Query privacy suppression is never treated as missing page traffic. Unknown brand classifications remain UNKNOWN. `optimization-policy.ts` owns deterministic detectors and central controls. `optimization.ts` persists decisions, paired experiments, immutable 7/14/28-day observations, daily snapshots and one strategic summary per ISO week. `optimization-report.ts` and `OptimizationDashboard.tsx` add owner-only explanation and measurement views at `/owner/growth/autopilot`.

Migration **052_seo_growth_optimization.sql** is additive/idempotent: six SEO-only audit/experiment/weight tables and four optional page-optimization columns. It does not alter sports, users, odds, analytics events, providers or historical experiments. Rolling deploy reads tolerate absent optimization columns. Apply with the existing `runMigrations` mechanism after release gates; never reset the database.

## Decision model

| Signal | Detection / automatic action |
|---|---|
| Striking distance | At least 30 impressions, position 8–20. Links need ≥50 impressions, ≥7 observed page days, a real entity-relevant query, rank spread ≤5 and non-declining daily demand versus a comparable previous window. |
| Low CTR | ≥100 impressions, position 3–20, CTR <60% of same-type/locale/intent/5-position-band peers. Zero-click discoveries without peers are LOW/OBSERVE, not proven underperformance. |
| HIGH metadata confidence | ≥500 impressions; ≥28 observed page days in both consecutive 28-day windows; ≥5 comparable peers; rank spread ≤3; relevant query observed ≥7 days. |
| Winning cluster | ≥3 distinct entities (locale variants do not multiply evidence), sustained impression/click growth and no ranking deterioration. |
| Decay | Prior ≥100 impressions/≥3 clicks and comparable ≥7-day evidence; >35% daily impression loss or >4 positions lost. Diagnose lifecycle, freshness, technical health, demand and intent first. |
| Low value | Published >90 days, 28 observed reporting days, <10 impressions. Resource priority review only, never deletion, redirects or automatic noindex. |

Automatic visible changes require existing **published BR fixture pages**, current verified data, a recent passing technical crawl, no existing/manual experiment, cooldown eligibility, comparable same-cluster/lifecycle controls and a new passing rendered HTML audit. Other locales/page families are measured and recommended, not automatically rewritten. All existing manual CTR experiments are protected.

Metadata uses fixed factual templates from canonical team identity, status and kickoff, never free-form GSC query text. Descriptions are snippet experiments, not a claim of direct ranking improvement. Stored metadata is displayed only while its source signature still matches current fixture facts; rescheduling/lifecycle changes restore normal factual rendering immediately. A failed post-change HTML verification restores the exact previous override and freezes the experiment.

Contextual link boosts affect only the existing three-link relevant hub/team/competition selection. They never introduce footer/sitewide spam or create new URLs. A paired link intervention may also prioritize existing verified H2H/form paragraphs inside the factual block; fixture identity stays first. Missing standings/form/H2H never produce invented text. This is a bundled contextual intervention, not a claim that a single factor caused movement. Boost/focus expiry is declared in the original audit record.

## Caps and kill switches

All requested controls live in `SEO_OPTIMIZATION` (`optimization-policy.ts`):

- optimizationEnabled, titleOptimizationEnabled, metaOptimizationEnabled, linkBoostEnabled, clusterLearningEnabled, rollbackEnabled.
- maxAutomaticTitleChangesPerDay **1**, maxAutomaticMetaChangesPerDay **1** (one shared title+description experiment), maxAutomaticLinkBoostsPerDay **3**; maxActionsPerRun **4**.
- maxClusterWeightChangePerWeek **1 point**, absolute range **−3…+3**. New priority orders maintenance candidates within a day bucket; original opportunity scores, quality thresholds, editorial priorities and publication cap do not change. Neutral/old signals decay; unused weights expire after 14 days. No recursive multiplication.
- minimumImpressionsForTitleTest **500**, minimumDaysObserved **7**, minimumExperimentSample **200**, minimumHighConfidenceDays **28**, minimumCohortSize **5**.
- metadataCooldownDays **28**, rollbackCooldownDays **56**, signalExpiryDays **14**.

The old V2 unconditional initial metadata write is superseded by this single confidence-gated path. Existing V2 metadata, factual content, publisher and indexed-page retention remain intact. Legacy weekly feedback is retained as historical code but no longer invoked; V2.1 cannot auto-delist a low-traffic page.

## Experiments and recovery

Deterministic hashed variant/control assignments are fixed by kind/type/locale/intent/position band/month. Controls must also match competition/lifecycle and stay within 0.5–2× impressions and ±3 rank positions. A page cannot participate as both variant and control or in multiple active experiments. The worker lease serializes mutations; persisted daily counts and unique action keys guard reruns. Baselines are frozen for 7/14/28 days; observation starts on the first full Pacific search day after change.

No winner is declared from a seven-day or undersized sample. ≥14-day, adequately sampled, severe control-adjusted deterioration freezes further changes for at least 56 days and requires diagnostic review; no blind seasonal/fixture rollback. Source/lifecycle changes freeze confounded experiments. Positive 28-day movement is explicitly a descriptive signal, not proof of causality. All old/new values, detector, confidence, reason, baseline, control, config version and release SHA are auditable. No manual action is needed for normal daily operation; exceptional frozen experiments remain safely held until engineering review.

Failure of the latest GSC sync, truncation/missing breakdowns, stale capture (>36 hours), missing finalized day, corruption, <7 observed days or unexplained 5×/<0.1× daily traffic shifts forces **OBSERVE_ONLY**. It never synthesizes zero demand. Existing V2 publishing and technical/sitemap health continue. No repeated sitemap writes for unchanged URL/lastmod hashes.

## Bootstrap and interpretation

Read-only bootstrap on 2026-09-29: 11 observed complete days (2026-09-16…26), 8,268 impressions, 15 clicks, 0.1814% CTR, weighted position 14.39. Seven-day: 6,746 impressions, 11 clicks, 0.1631% CTR. Conservative query classification: 3 non-brand clicks / 3 unknown in the 28-day report; anonymized queries excluded, never inferred.

3,165 measured/managed page records; 22 striking-distance discoveries. Examples: LOSC Lille–Nice 326 impressions / position 11.07; Birmingham–Middlesbrough 187 / 9.60; Willem II–Fortuna Sittard 141 / 10.75; SC Freiburg team 118 / 11.42. All are low-confidence because page-level days/control evidence are insufficient. No qualified winner/decay/metadata experiment and no forced link or title changes. Low-CTR zero-click discoveries are separately shown with inadequate-cohort explanations.

Growth results cannot be validated on launch day. The system must accumulate the stated windows; no test fixtures or invented outcomes enter production metrics. Organic engagement/comparison/eligible server-confirmed outbound rates use only existing HUMAN attribution and are secondary quality signals, not revenue-only publishing objectives.

## Release verification

Run focused and full tests, typecheck, lint, build, secret scan and SEO route audit. Use a PR, hosted CI and the existing Vercel preview; apply only migration 052 through the normal migrator, then merge and verify the production SHA. Invoke the protected daily worker twice at most for acceptance; compare action counts and sitemap submitted hashes/timestamps. Verify GSC health remains full webmasters/siteOwner, owner desktop/mobile rendering, anonymous protection and providerRequests=0. Do not rerun sports ingestion/social generation or touch affiliate/slip/provider configuration.

Release-specific SHA, PR, migration and production acceptance evidence are recorded in the PR and the final handoff, not guessed here before deployment.
