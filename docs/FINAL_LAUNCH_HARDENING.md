# Final Launch Hardening

Date: 2026-09-19. Baseline: `fbed2215d435590485db391f1041a70a5fe071b5`.
Scope: launch defects, security, reliability, performance, and evidence only. No new product milestone, infrastructure, paid service, provider package, or traffic generation.

## Release status

Pre-release gates passed; final production verification is pending. This document is not yet a traffic-ready declaration.

## Corrections

- Auth callbacks enforce the same normalized email and atomic per-email/IP limits as the sign-in form. SMTP operations have bounded timeouts; auth errors log a safe type instead of token/SMTP details. Expired/replayed links show localized feedback.
- Cross-instance, HMAC-keyed request limits protect auth, search, analytics, favorites, owner actions, slip APIs, and commercial offers. Bounded request bodies and existing same-origin/authorization checks remain in place. The limiter fails closed if its store is unavailable; no provider fallback is introduced.
- My Matches refreshes its bounded DB-only feed after guest merge and favorite mutations instead of retaining stale pre-merge SSR data. Database failure is distinguished from an empty feed.
- Affiliate redirect events use the authoritative click-ledger UUID; replaying a signed redirect does not double-count the analytics outcome. Destination allowlists, approval, GEO and proxy policy are unchanged.
- Analytics rejects mixed identities, restricts session updates/reclassification to the same anonymous identity, and excludes owner/QA/bot sessions from HUMAN totals. Server analytics is deferred after the response; telemetry errors do not block user actions.
- Expired odds no longer count as useful scheduler coverage. Explicit targeted recovery makes one attempt per bookmaker within its two-request budget; failed attempts respect the same cooldown as successes. Quote truth, matching tolerance, TTL, approved proxy rules, and independent real prices are preserved.
- Owner alert delivery is claimed atomically, retried after a bounded delay, and can recover from missing configuration. Resolution delivery failures remain retryable. Protected synthetic tests use fixed recipients/copy, no fake public outage, one drill per hour, and per-phase dedupe.
- Player sitemap eligibility is equivalent but index-friendly. Three additive concurrent indexes remove the historical player-page/count bottleneck. Exact old/new eligible-set comparison returned the same 60,760 players.
- Page security headers added without overriding the isolated sponsor creative sandbox. Auth responses use no-referrer. The policy permits Next's required inline bootstrapping; it is not claimed to be a nonce-only CSP.
- Small-screen authenticated header controls no longer compress the brand into adjacent controls. Accessible brand text and existing light/dark design remain intact.
- Lab-found contrast defects in selected filter counts/timezone text and the desktop competition-toggle accessible name are corrected. Long fixture lists retain every fixture in the DOM/accessibility tree while supported browsers skip off-screen rendering, with intrinsic row-size estimates.
- Expired analytics/quality data has 90-day, bounded 5,000-row/hour maintenance; existing incident retention remains 14/30/90 days. Sports, user accounts, favorites, commercial click truth, and odds history are not deleted by this maintenance.

## Database and provider accounting

Read-only repeatable-read audit at 09:16 UTC: 34 enabled competitions, 43,397 fixtures, 2,388 teams; migrations 001–028 exactly once; invalid indexes, blocked locks, duplicate quotes, orphan quotes and mixed HUMAN sessions all zero.

027 was applied atomically; second application was a no-op. 028 added only concurrent indexes; repeat application was a no-op and all indexes valid. No reset, wipe, re-ingestion, or fixture timestamp/identity changes.

Hardening consumed exactly **4 OddsPapi requests and 0 Sportmonks requests**. The first bounded MLS recovery used two Betano attempts and revealed peer starvation. After fixing the retry policy, the second bounded recovery made one request per bookmaker; both returned upstream HTTP 500. Manual retries stopped. Existing scheduled ingestion independently returned Betsson prices for all 13 MLS fixtures within 24h. Betano MLS absence is surfaced as degraded, not hidden as real quotes.

09:16 snapshot (changes as fixtures/quotes age):

| Horizon | Scheduled | Any odds | Match winner / OU2.5 | BTTS | Betano real | Betsson real | Both real | Proxy-only | Neither |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 24h | 162 | 90 (55.6%) | 90 / 90 | 89 | 62 | 81 | 53 | 37 | 72 |
| 3d | 229 | 154 (67.2%) | 154 / 154 | 150 | 115 | 144 | 105 | 49 | 75 |
| 7d | 245 | 155 (63.3%) | 155 / 155 | 151 | 116 | 144 | 105 | 50 | 90 |
| 14d | 309 | 166 (53.7%) | 166 / 166 | 162 | 127 | 144 | 105 | 61 | 143 |

Proxy-only is a fixture count, not fabricated provider truth. Stale counts: 24h 2; 3d/7d 4. Coverage is not advertised as 100%. Large fixture catalog populations such as FA Cup include provider-absent prices; see owner health's evidence and classifications. Final snapshot must be read again after release.

## Verification completed before release

- 1,064 Vitest tests (137 files) + 17 Node tests = **1,081 passed**; typecheck, lint, production build and repository secret scan passed.
- Real approved test account: Google login, localized account retrieval, magic-link delivery/consumption, single-use rejection, session persistence, account summary, guest merge and favorites. Team/competition/fixture test favorites were removed; account summary returned to 0/0/0. Original production slip leg and its stake were preserved.
- Baseline HTTP smoke: 37 requests, 36 passed / 1 failed. The affiliate reconciliation failure was the bug fixed above, not waived. Final smoke must pass after deployment.
- Real DB-backed 3-leg both-real and 5-leg mixed comparisons verified independent source identities, decimal multiplication, returns, unavailable finished-leg behavior, and zero provider requests.
- Local responsive checks: home, football hub, competition, match, team, player, sign-in, My Matches, slip at 375/390/430/768/1024/1440; page horizontal overflow zero. Light/dark screenshots inspected; 44px odds targets retained. Home first fixture ~477px on mobile without owner/ad chrome. Production sponsor/owner variants require post-release check.
- Isolated local origin started with zero slip legs: added two real fixture selections, changed stake to 12.50, observed independent combined odds 3.15/3.24 and returns 39.38/40.50, reloaded with both selections/stake/theme intact, removed one, cleared only the remaining test selection, and verified the empty state. Production's original finished Atlético de Madrid–Osasuna selection and stake 25 were not changed.
- Local database-denial state showed truthful unavailable messaging, not fake empty data or a provider call. Automated failure tests cover telemetry, cache/DB, health and auth boundaries.
- SEO HTTP sample: 89 requests, 80 checks, no failures. Canonical/hreflang, private noindex, real 404s, sitemap exclusion and robots checked.
- Google property verified; both sitemaps Success. Six inspected URLs: BR home and odds-comparison help indexed with self canonical and successful allowed smartphone crawl; competition/player/match discovered but not yet indexed; sampled team unknown to Google. No bulk indexing requests. Help inspection reported a temporary referring-sitemap processing warning despite indexed state.
- Bing main sitemap and sports index Success. Historical child `players-97.xml` reported an old error; HTTP returned valid 1,500-URL XML. The slow underlying SQL is fixed; re-crawl status remains external.
- Existing Resend domain, DKIM and SPF verified. Controlled magic link delivered. OWNER_ALERT_EMAIL saved in existing Vercel Production; deployment/alert drill remains required.

## Backup and rollback

Observed existing Neon project `polished-hall-26832454`, main branch `br-frosty-boat-awqp2a57`: Postgres 18; **6-hour history window**, 8.82GB storage, autoscaling 0.25–8 CU, scale-to-zero 5 minutes. Main is not marked protected. No setting/billing changes or restore was executed. No independent long-retention snapshot/restore drill is claimed.

For an incident: freeze affected writes, record the last known-good UTC timestamp inside that 6-hour window, inspect historical data with Time Travel Assist, and obtain explicit approval before any restore/new recovery branch. Preserve the current branch state, validate schema/data/auth before cutover, and account for writes after the recovery point. [Neon restore API](https://api-docs.neon.tech/reference/restoreprojectbranch) documents timestamp/LSN and current-state preservation. Recovery beyond the configured window is not proven.

Application rollback target: existing READY deployment `dpl_E2zJpM6hzK546MSnqzdUMfFDRFrp` at baseline SHA, in `nikapopkha3-4447s-projects/livasports`. Promote that known deployment only for a verified release regression. App rollback does not roll back DB or revoke sessions. Additive 027/028 can remain when reverting app code; no automatic down migration or index drop. Verify DATABASE_URL, AUTH/Google/SMTP, separate OWNER_QA secrets, affiliate signing/destinations and CRON_SECRET by behavior without exposing or rotating them.

## Runtime dependencies

| Dependency | Role / failure behavior | Visibility |
| --- | --- | --- |
| Neon | Persistent sports/auth/favorites/odds; cached sports fallback, honest unavailable state; auth/limits fail closed | Logs, internal/owner health |
| OddsPapi | Pregame refresh only; retain last truth, expire by TTL; bounded retries/budgets | Odds health, incidents, request ledger |
| Sportmonks | Controlled sports ingestion; ordinary navigation never calls it | Ingestion history, module freshness |
| Resend SMTP | Magic links and alerts; bounded timeouts; Google login remains independent | Delivery dashboard, alert channel/status |
| Google OAuth | User sign-in; magic-link path independent | Localized auth errors / safe logs |
| Vercel | Hosting, HTTPS and release routing | READY status, release.commit, runtime logs |
| Betsson assets | Approved sandboxed creative; failure must not block sports/slip | Placement QA, commercial health |
| cron-job.org | Existing five-minute protected odds ticker | Scheduler execution history, stale tick alerts |

GitHub workflow is manual `workflow_dispatch` only; vercel.json defines no cron. No second scheduler was activated.

## Known limitations / release evidence still required

- WebKit/real iPhone not available through current browser tools; NOT RUN, not PASS.
- No field CWV data. [Baseline PageSpeed lab](https://pagespeed.web.dev/analysis/https-livasports-com-br/ufik104fsc?form_factor=mobile): emulated Moto G Power, slow 4G, Chromium 153/Lighthouse 13.4.1; performance 76, FCP 2.0s, LCP 5.9s, TBT 130ms, CLS 0; desktop LCP 1.3s, CLS 0, TBT 370ms. This identified 8,344 DOM elements and the contrast/label issues corrected above. Final production repeat is required; no field CWV PASS is inferred.
- Provider gaps/upstream MLS 500s and reserve-only request pacing remain visible operational constraints; do not spend requests retrying a clearly failing upstream.
- Six-hour DB recovery horizon and unprotected main require prompt incident response; expanding retention/protection is not silently authorized.
- Final exact-SHA READY deployment, production smoke/reconciliation, alert delivery/dedupe/resolution, runtime logs and final health snapshot are pending.

Private evidence under ignored `output/hardening-*` contains no intentionally printed credential values and must not be bulk-added to Git.
