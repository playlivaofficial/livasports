# Final Launch Hardening

Date: 2026-09-19. Baseline: `fbed2215d435590485db391f1041a70a5fe071b5`.
Scope: launch defects, security, reliability, performance, and evidence only. No new product milestone, infrastructure, paid service, provider package, or traffic generation.

## Release status

Implementation released at `0576912d61ea3dfbce20e267d581e652cef02613`; existing project deployment `dpl_5J7oHJ3Kmemcw3HTXw6MAkfEHBni` is READY. Apex `https://livasports.com` reports that exact commit. Final report-only publication does not alter this tested implementation. No traffic was generated.

**LIVASPORTS — NOT TRAFFIC READY.** Safe software fixes are released and verified; the traffic-on gate is held for one P1 operational coverage/budget issue below. A green aggregate classifier or a successful zero-request scheduler tick is not a launch waiver.

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
- Empty odds rows no longer install price-expiry timers or repeatedly rebuild unchanged bookmaker rows; priced rows keep their existing expiry behavior. Country flags use the same country codes with small 80px PNGs instead of oversized SVGs ([documented CDN variants](https://flagpedia.net/download/api)); Mexico/Spain decoded payload samples fell from 143,318/153,035 bytes to 562/673 bytes. All 34 competition entries remain discoverable.
- Provider shootout attempt numbers are now displayed as `#1`–`#8`, after regulation/extra-time events, rather than as first-half minutes. The real finished-match score, canonical identity, stored events and provider truth are unchanged. Both match-rendering implementations share the tested rule.
- Expired analytics/quality data has 90-day, bounded 5,000-row/hour maintenance; existing incident retention remains 14/30/90 days. Sports, user accounts, favorites, commercial click truth, and odds history are not deleted by this maintenance.

## Database and provider accounting

Read-only repeatable-read audit at 10:15:28 UTC: 34 enabled competitions, 43,397 fixtures, 2,388 teams; migrations 001–028 exactly once; invalid indexes, blocked locks, duplicate quotes, orphan quotes and mixed HUMAN sessions all zero. Observed analytics: 258 events / 23 sessions; 87 incident-history rows. These operational counts include deliberately classified QA and change over time.

027 was applied atomically; second application was a no-op. 028 added only concurrent indexes; repeat application was a no-op and all indexes valid. No reset, wipe, re-ingestion, or fixture timestamp/identity changes.

Hardening's explicit recovery tests consumed exactly **4 OddsPapi requests and 0 Sportmonks requests**. The first bounded MLS recovery used two Betano attempts and revealed peer starvation. After fixing the retry policy, the second bounded recovery made one request per bookmaker; both returned upstream HTTP 500. Manual retries stopped. Existing scheduled ingestion independently recovered: at 10:13 UTC MLS had Betsson real prices for all 13 fixtures within 24h and Betano real prices for 6. Background scheduler usage is separate from these four diagnostic requests.

10:15:28 UTC snapshot (changes as fixtures/quotes age):

| Horizon | Scheduled | Any odds | Match winner / OU2.5 | BTTS | Betano real | Betsson real | Both real | Proxy-only | Neither |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 24h | 163 | 87 (53.4%) | 87 / 87 | 87 | 74 (45.4%) | 43 (26.4%) | 30 | 57 (65.5%) | 76 (46.6%) |
| 3d | 229 | 150 (65.5%) | 150 / 150 | 147 | 129 (56.3%) | 105 (45.9%) | 84 | 66 (44.0%) | 79 (34.5%) |
| 7d | 245 | 151 (61.6%) | 151 / 151 | 148 | 130 (53.1%) | 105 (42.9%) | 84 | 67 (44.4%) | 94 (38.4%) |
| 14d | 309 | 162 (52.4%) | 162 / 162 | 159 | 141 (45.6%) | 105 (34.0%) | 84 | 78 (48.1%) | 147 (47.6%) |

Proxy percentage uses priced fixtures as its denominator; all other percentages use scheduled fixtures. Proxy values are never persisted as provider truth. Stale-only: 24h 8 (4.9%); 3d 10 (4.4%); 7d 10 (4.1%); 14d 10 (3.2%); two of these were explicitly closed. Coverage is not advertised as 100%. FA Cup contributes 76 fixtures / 9 priced; provider absence, local expiry and a true refresh failure must not be conflated.

At this snapshot the classifier reported 19 HEALTHY / 15 IDLE, with no critical/degraded competition, but this is **not** proof of complete bookmaker coverage. The five-minute cron ran at 10:10 UTC with zero provider calls because the rolling cap was full. At **10:15:12 UTC automatic refresh resumed with one successful provider request**, after a rolling slot reopened, without manual intervention. Rolling scheduled usage returned to **210/210**, routine headroom zero, pressure EXHAUSTED; ten planned batches remained deferred. Period allowance 4,500, used 1,254, remaining 3,246; projected usage 3,927, no projected overrun. Do not raise caps or bypass pacing to obtain a green screenshot.

## Verification completed

- After the final implementation fixes: 1,066 Vitest tests (137 files) + 17 Node tests = **1,083 passed**; typecheck, lint, production build (51 static routes) and repository secret scan passed.
- Real approved test account: Google login, localized account retrieval, magic-link delivery/consumption, single-use rejection, session persistence, account summary, guest merge and favorites. Team/competition/fixture test favorites were removed; account summary returned to 0/0/0. Original production slip leg and its stake were preserved.
- Baseline HTTP smoke: 37 requests, 36 passed / 1 failed. The affiliate reconciliation failure was fixed, not waived. Final implementation production smoke at 10:11 UTC: **37 requests, 37 checks passed, zero provider calls, zero operator requests**, including exact release.commit, all three locale route families, owner isolation, real slip math, safe redirect boundary, analytics dedupe and ledger reconciliation.
- Real DB-backed 3-leg both-real and 5-leg mixed comparisons verified independent source identities, decimal multiplication, returns, unavailable finished-leg behavior, and zero provider requests.
- Local and production responsive checks: home, football hub, competition, match, team, player, sign-in, My Matches, slip at 375/390/430/768/1024/1440; page horizontal overflow zero. Light/dark screenshots inspected, theme persisted, 44px odds targets retained. Mobile first fixture ~472px without owner/ad chrome; desktop rows ~68px. Approved sponsor and owner-preview variants inspected; mobile/full-width and desktop/tablet banner constraints preserved. Owner analytics also renders at 390px without overflow.
- Isolated local origin started with zero slip legs: added two real fixture selections, changed stake to 12.50, observed independent combined odds 3.15/3.24 and returns 39.38/40.50, reloaded with both selections/stake/theme intact, removed one, cleared only the remaining test selection, and verified the empty state. Production's original finished Atlético de Madrid–Osasuna selection and stake 25 were not changed.
- Local database-denial state showed truthful unavailable messaging, not fake empty data or a provider call. Automated failure tests cover telemetry, cache/DB, health and auth boundaries.
- SEO HTTP sample: 89 requests, 80 checks, no failures. Canonical/hreflang, private noindex, real 404s, sitemap exclusion and robots checked.
- Google property verified; both sitemaps Success. Six inspected URLs: BR home and odds-comparison help indexed with self canonical and successful allowed smartphone crawl; competition/player/match discovered but not yet indexed; sampled team unknown to Google. No bulk indexing requests. Help inspection reported a temporary referring-sitemap processing warning despite indexed state.
- Bing main sitemap and sports index Success. Historical child `players-97.xml` reported an old error; HTTP returned valid 1,500-URL XML. The slow underlying SQL is fixed; re-crawl status remains external.
- Existing Resend domain, DKIM and SPF verified. Production Google login from PT-BR, EN and ES-MX sign-in routes and localized account retrieval passed; user logout preserved the separate owner session. A fresh post-release magic link was delivered and consumed, then its replay showed the localized expired/already-used state; expiry is additionally covered by automated tests. No token value was logged in evidence.
- OWNER_ALERT_EMAIL is active in the existing Vercel Production environment. Safe synthetic OPENED and RESOLVED messages were both confirmed DELIVERED in Resend, once each; replay returned ALREADY_SENT. No fake public outage. Existing real resolution notifications also resumed. SMTP/provider settings and secrets were not rotated.
- Post-release favorites: one new fixture favorite appeared in My Matches, removal immediately produced the correct empty state, and account counts returned to 0/0/0. Only test-created items were removed. The original production slip remains one leg, stake 25.
- Final slip examples: three independent real legs yielded Betano 10.398375 / Betsson 9.5904, stake-10 returns 104.00 / 95.90. Five mixed legs yielded 36.092759625 / 33.2882784, returns 360.90 / 332.90; Betsson had three REAL and two PROXY legs. Betano CTA remained unavailable as configured; approved Betsson owner-preview CTA worked. No operator redirect was followed and no deposit/FTD/revenue was fabricated.
- Final QA funnel: 8 events / 8 unique IDs / 0 HUMAN; one outbound outcome paired with exactly one click-ledger record. Signed redirect replay did not add another outcome; arbitrary external destination injection was rejected.
- HTTPS and www-to-apex redirect passed. Production HTML plus 14 JavaScript documents scanned: **zero credential leaks**. Runtime review found no unexpected warning/fatal/5xx; one intentional magic-link replay produced the expected sanitized `Verification` error and 302. Normal sports/profile/match logs and all tested read paths reported providerRequests=0.

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

GitHub workflow was manual `workflow_dispatch` only at launch; vercel.json defines no cron. Since 2026-09-22 (production stall of 2026-09-21: the external cron disabled itself after 503 answers) the workflow also runs on a 10-minute fallback schedule; the backend lease (409) de-duplicates overlapping ticks. See `docs/P6_PIPELINE_RECOVERY.md`.

## Performance and remaining limitations

- WebKit/real iPhone not available through current browser tools; NOT RUN, not PASS.
- No field CWV data. [Final PageSpeed lab](https://pagespeed.web.dev/analysis/https-livasports-com-br/k1378ygwgo?form_factor=mobile), final implementation, 10:10 UTC: emulated Moto G Power, slow 4G, Chromium 153/Lighthouse 13.4.1. Mobile performance **73**, FCP **1.951s**, LCP **5.176s**, TBT **278ms**, CLS **0**, speed index **3.243s**. Desktop performance **95**, FCP **0.421s**, LCP **1.021s**, TBT **101ms**, CLS **0.012**. Accessibility/best practices/SEO scored **100 on both**. Automated accessibility is not a complete manual-accessibility guarantee.
- Mobile LCP remains above the good threshold; no CWV PASS is claimed. Useful content appears around two seconds, no skeleton loop/runaway UI was observed, and interactive slip/auth journeys work. Baseline mobile LCP was 5.9s / desktop 1.3s; final rendering is not a severe regression, but further mobile loading work is a documented P2 optimization. A 09:46 lab sample measured TTFB 290ms; latency varies with cold DB/cache state. The previously ~58s player sitemap child returned valid 1,500-URL XML in 2.116s after indexing.
- Existing search has a non-critical accent-recall limitation: unaccented `atletico` does not match every `Atlético` name. Exact/accented names and matching fragments work; no provider fallback occurs. Record as P2 rather than silently rewriting search/index policy during launch.
- Google discovery/indexing is asynchronous; the sampled competition/player/match are not yet indexed and the team sample was unknown. Bing's historical player-child warning awaits re-crawl despite current valid fast XML. Submission success is not indexing success.
- Provider gaps/upstream MLS 500s and rolling-budget pacing remain visible operational constraints; do not spend requests retrying a clearly failing upstream. A zero-request successful tick means scheduler execution succeeded, not that fresh prices were fetched.
- Six-hour DB recovery horizon and unprotected main require prompt incident response; expanding retention/protection is not silently authorized.
- No real iPhone/WebKit run or real live-match observation is claimed. Neon restore capability and rollback path were inspected; no destructive restore drill was executed.

Private evidence under ignored `output/hardening-*` contains no intentionally printed credential values and must not be bulk-added to Git.

## Traffic-ready scorecard

P0 blockers: **0 observed**.

P1 blockers: **1 — sustained independent-bookmaker coverage under the existing rolling request budget is not yet proven safe for traffic**. At the final bounded snapshot, only 30/163 next-24h fixtures (18.4%) had both REAL feeds; Betsson REAL was 43/163 and proxy-only was 57/87 priced fixtures. Eight fixtures had only stale/closed quotes, six excluding explicit closures. Provider-absent FA Cup fixtures explain much of the total gap but do not explain away local expiry. Earlier Betsson 24h REAL coverage was 81/162; it declined while rolling-cap ticks deferred work. One automatic recovery request proves the scheduler can resume, not that the sustained freshness requirement is met. Keep acquisition paused. Re-evaluate coverage and per-feed freshness through an existing, budget-compliant busy period; resolve deficient allocation or obtain an explicit capacity/scope decision if the approved quota cannot sustain the required cadence. No purchase, cap increase, TTL relaxation or extra retry storm was performed.

P2 open items: **4** — mobile slow-4G LCP optimization; accent-insensitive search recall; historical Bing child-sitemap/re-crawl warning and incomplete indexing; limited six-hour DB recovery horizon/unprotected main (no restore drill). WebKit/real-device availability is separately NOT RUN.

| Gate | Result |
| --- | --- |
| Auth / real user flow | PASS |
| Favorites / My Matches | PASS; test data cleaned, original data preserved |
| My Slip / independent REAL / approved proxy math | PASS |
| Affiliate flow / affiliate analytics | PASS, controlled non-followed QA redirects only |
| Odds 24h / 3d / 7d / 14d | 53.4% / 65.5% / 61.6% / 52.4% any-priced; P1 traffic hold above |
| Betano REAL / Betsson REAL / proxy | 24h: 45.4% / 26.4% / 65.5% of priced fixtures |
| SEO / Google Search Console / Bing main submissions | PASS; indexing and historical child warning explicitly limited above |
| Analytics | PASS; QA/OWNER/BOT exclusion and one-to-one click reconciliation |
| Owner health / owner alert email | PASS functionality; aggregate HEALTHY does not override the P1 launch hold |
| Mobile responsive | PASS: 375/390/430/768/1024/1440; horizontal overflow 0 |
| WebKit / real iPhone | NOT RUN; unavailable |
| Performance | FAIL good mobile-LCP target; usable and improved, documented P2 rather than a severe regression |
| Accessibility | PASS tested controls/contrast and 100 mobile/desktop lab; not a universal compliance certification |
| Security / rate limits / DB health | PASS |
| Cron | PASS actual five-minute invocation and bounded automatic recovery; freshness capacity remains the P1 |
| Resend | PASS magic link plus alert/open/resolution delivery |
| Normal navigation providerRequests | **0** |
| Tests | **1,083 PASS** (1,066 Vitest + 17 Node) |
| Typecheck / lint / production build / secret scan | PASS |
| Rollback ready | YES; app target identified, DB recovery limited to observed six-hour capability |
| Traffic checklist / first-seven-days runbook | CREATED |

The hardening implementation is safe to keep deployed. The remaining P1 is a traffic-readiness restriction, not a reason to undo verified security/auth/data-integrity fixes. No new milestone or traffic-generation work is authorized by this report.
