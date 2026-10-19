# LivaSports 2.0 — preservation and implementation audit

Audit date: 2026-10-19. Scope: `playlivaofficial/livasports` only. PlayLiva is excluded.

## Preservation point

- Verified production `/api/internal/health` and fetched `origin/main`: `d3acfbe06e38a8615a7686f8e5a2bfcd286656bf`.
- GitHub annotated tags: `livasports-pre-v2-2026-10-19-d3acfbe` and `archive/livasports-pre-v2`. These references must never be moved or force-pushed. They retain complete source, migrations and history, without copying credentials.
- Archive references are **tags**, not deployment branches. Existing CI triggers PRs and pushes to main, not tags. No second Vercel project or legacy deployment is created.
- Working branch: `codex/livasports-v2`, in the existing clean release checkout `.qa-master/seo-ctr`. The original root checkout has pre-existing secondary-provider validation changes; those remain untouched.
- No database schema or data deletion is authorized or planned. Existing users, sessions, favorites, slips, campaigns, attribution, fixtures, historical data and migration ledger remain intact.

## Existing architecture, verified from source

| Boundary | Existing implementation | V2 treatment |
| --- | --- | --- |
| Framework | Next.js 16.3.4 App Router, React 19, TypeScript, custom CSS, Vitest; multiple localized root layouts | Retain stack and route prefixes; static editorial content with small browser tools |
| Database | PostgreSQL/Neon via `pg`, explicit SQL repositories and migrations through 071 | Keep account and business records; no destructive migration |
| Public layout | `localization/PublicRootLayout`, static HTML; private `/api/presentation` after hydration | Reuse trusted presentation boundary, replace legacy slip enhancements |
| Themes | Light initial HTML, pre-hydration localStorage preference, `ThemeToggle` | Preserve preference key and no-flash behavior; new full theme token system |
| Language | `localization/interface`, `LanguageSelector`, POST `/language`; br/mx/co/pe/en | Preserve Portuguese, English and regional Spanish; extend translation mapping for new routes |
| GEO | `odds/commercial-geo`, trusted Vercel country header, signed Owner preview | Reuse authoritative boundary. Editorial country and language never authorize promotions |
| Accounts | Auth.js v5, Google and email link, PostgreSQL adapter, database sessions, rate limits, profile/logout | Preserve identity/session implementation; adapt account presentation, locally saved tools |
| Owner | Separate hashed permanent key and signed 30-day session in `owner/session`, `/api/owner/preview` | Preserve login, cookies, authorization and MX/CO/PE preview; replace obsolete operational controls |
| Affiliate | Existing campaign/creative SQL registry, `affiliate` modules, signed `/go` and QA classification | Preserve records and secrets; prepare inactive V2 slots only. No destination migration/activation |
| Analytics | First-party events, consent/privacy safeguards, HUMAN vs OWNER/QA/BOT filtering | Keep bounded consent-aware measurement; no placeholder referral events |
| SEO | Legal/help static content, canonicals/hreflang, XML maps, live competition/match/profile routes, GSC machinery | Inventory and classify old URLs; preserve useful editorial/history, explicit retirement where no equivalent |
| Sports runtime | Sportmonks and OddsPapi adapters; ingestion, standings, odds, matching, caches, five-minute refresh | Remove from active public routes and all callable refresh surfaces; no fabricated replacement data |

## Cost-driver inventory before rebuild

At baseline, `vercel.json` schedules standings every five minutes, odds every five minutes, hourly GEO Top 5, daily SEO Autopilot, authority and SEO refresh (six cron entries). `.github/workflows/odds-refresh.yml` adds a ten-minute fallback ticker. Its old comment mentions cron-job.org; the later `P6_PIPELINE_RECOVERY.md` documents that external service disabled/unreachable since 2026-09-22, with Vercel as primary. V2 removes Vercel/GitHub schedules and makes all authenticated legacy scheduler URLs terminal 410 with no provider execution. Do not reactivate the external ticker.

Other costs include database-driven sports reads/sitemaps, cache warming, legacy image optimization and historical rendering infrastructure (`ffmpeg-static`, social generation). New interactive tools must not call any sports provider or require recurring jobs. Preserve archival code until replacement tests establish safe removal/retirement. Do not cancel subscriptions or change billing.

Vercel usage was inspected on 2026-10-19 for the Oct 16–Nov 16 cycle, with the project filter set to LivaSports. Partial-cycle infrastructure subtotal: **$25.00**. Main drivers: 2.09M ISR writes ($8.36), 9.89M observability events ($5.85), 39GB origin transfer ($3.37), 24 CPU hours ($3.20), 3.82M function invocations ($2.29), 1.75M ISR reads ($0.70). This is a snapshot, not a monthly forecast. Team licenses separately show Pro $20 plus Flat Rate CDN 10M $20: **$40 fixed subscriptions**, not $20. Billing is not changed by this task. Post-release usage must be observed before claiming measured savings.

Baseline suite: 17 Node tests + 3,079 Vitest tests across 292 files passed (3,096 total).

## Product and route plan

- Existing `/{locale}` homes become premium editorial homes; existing football hub routes become useful evergreen league discovery.
- Add localized article/league/tool/review destinations and meaningful server-rendered internal links; one central content inventory drives metadata, search, translation and sitemap.
- New tools: lineup builder, tactical board, manual odds/probability calculator and football quiz. Browser-only calculations/storage/export; no feeds or fabricated prices.
- Existing auth and legal route identities stay. Accurate evergreen help content is retained/adapted where its old live-slip instructions are obsolete.
- Old live/daily/competition queries and entity routes need explicit per-family disposition; do not blanket-redirect to the homepage. Historical records stay in DB even if a public route retires.
- Public commercial modules start empty/fail-closed until the trusted presentation response. Verified identity assets may be shown in pending slots for eligible GEOs; no real tracking destination is copied. BR and ROW stay non-commercial.
- Keep Owner commercial design preview usable and distinct from normal traffic. No public preview bypass.

## Release stages and evidence

1. Audit/archive production, baseline tests and current usage/route inventory.
2. Static editorial architecture, mobile-first design system, original local imagery, all three languages.
3. Functional browser tools, preserved account/Owner/GEO boundaries, pending commercial contract.
4. Safe legacy route retirement and complete scheduler/provider shutdown (including external ticker).
5. Full tests, lint, types, build, secrets, SEO, dependency checks and eight-width browser matrix.
6. PR/hosted CI/preview/normal merge, existing Vercel production only, production acceptance.
7. `CLAUDE_AFFILIATE_HANDOFF.md` plus evidence-based release/cost report.

## Rollback

Do not reset or force-push main. If a release-blocking regression appears, revert the V2 merge through a reviewed PR, or promote the verified prior production deployment using the existing project's rollback workflow. Source can be checked out from either archive tag into a separate temporary checkout. Re-enable retired schedules only with explicit awareness that doing so resumes paid-provider use. Database compatibility and existing credentials must be verified before rollback; never restore by wiping current records. No secrets are in this document or the archive tags.
