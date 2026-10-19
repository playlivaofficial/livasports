# LivaSports 2.0 — release evidence

## Scope and preservation

Baseline: `d3acfbe06e38a8615a7686f8e5a2bfcd286656bf`. Branch: `codex/livasports-v2`.
Immutable GitHub tags: `livasports-pre-v2-2026-10-19-d3acfbe` and `archive/livasports-pre-v2`.
The legacy application is not a second live project or deployment branch. The original dirty provider-validation checkout is untouched. No DB migration, deletion, account reset, credential change or billing/subscription change.

The replacement is static multilingual football editorial and four local tools, with existing database accounts, separate Owner authentication, trusted GEO and private analytics history preserved. Six useful evergreen articles, six league guides, localized search, noindex verification-framework operator pages, legal/help destinations and 165 indexable canonical URLs are linked through ordinary server-rendered anchors.

## Runtime/cost boundary

- Six Vercel cron entries removed; GitHub ten-minute odds fallback workflow removed.
- Public legacy live-data APIs return 410; private Owner/CRON actions retain authentication and return 410 when authorized. No sports provider, media renderer or refresh runner is reachable from active route imports (AST regression test).
- Normal new editorial navigation and browser tools have no sports/provider fetches. Browser tools use localStorage/canvas only. No sports-data account or subscription is needed by V2.
- Historical matches/teams/players remain at canonical stable public IDs with explicit archive notices; bounded read-only queries, cached output, no false live status. Final scores only where stored as finished. Saved account/guest favorites are preserved as historical records. Old slips remain stored but are not a new-product feature.
- The external cron-job.org service was documented disabled/unreachable since 2026-09-22 in `P6_PIPELINE_RECOVERY.md`; it is not the active primary ticker. All retired HTTP scheduler boundaries additionally fail closed even if an external caller resumes. Do not reactivate that service.
- October 19 pre-release Vercel snapshot: LivaSports $25 partial-cycle infrastructure usage; team fixed subscriptions **$40** ($20 Pro + $20 Flat Rate CDN 10M). No claim of a $20 total or measured monthly savings. Database, auth/email, ordinary analytics and bandwidth are not free. Observe post-release usage before forecasting savings. Owner must cancel paid sports subscriptions separately if desired.

## URL disposition

| Existing family | V2 behavior |
| --- | --- |
| `/br`, `/en`, `/mx`, `/co`, `/pe`; football hubs | Preserved; useful editorial replacements |
| Legal and evergreen help URLs | Preserved and updated where old live-slip instructions were obsolete |
| Six supported competition fixture hubs | Relevant 301 to localized league guide |
| Unsupported competition tabs, live and daily fixtures | Explicit 410; no homepage redirect |
| Canonical match/team/player URLs | Read-only historical record; obsolete slug 308; unknown identity 404 |
| `/sports-sitemaps.xml` | 301 to `/sitemap.xml` |
| Valid obsolete sports sitemap batch | 410; malformed/unknown routes 404 |
| Account, sign-in, Owner, search, pending reviews, `/go` | Noindex; private endpoints remain protected |

No artificial editorial refresh dates, fake ratings/offers or automated indexing calls. Search ranking/index retention cannot be guaranteed by a technical migration.

## Local verification (2026-10-19)

- Baseline 17 Node + 3,079 Vitest passed. Final candidate before social-card/search-label finishing edits: **17 Node + 3,185 Vitest**, zero failures/skips.
- Lint/typecheck/production build, frozen offline lock validation, full SEO crawl and secret scan passed. Final release gates are rerun after finishing edits and verified again by hosted CI.
- SEO crawl: **165 indexable pages, 190 bounded HTTP requests, zero findings** (canonicals, languages, reciprocal hreflang, sitemap, schema, crawlable links, no orphan page, private/noindex boundaries, 301/410/404).
- Browser: **208 page/viewport/theme checks** (13 route targets × 8 widths × 2 themes), plus **48 authenticated Owner/pending-commercial checks**. All report zero horizontal overflow. Widths 320/360/375/390/430/768/1024/1440. Account targets redirected to sign-in in local QA, not a claim of authenticated account-page coverage.
- Direct visual inspection: home light/dark desktop/mobile, long-read article, local pitch/tool controls, pending Peru cards, Owner analytics. Screenshots retained locally in ignored `output/v2-qa/`.
- Lineup: player labels, keyboard movement, save/reset/load and PNG export. Tactics: 22 players, keyboard arrow endpoints, annotations, save/reset/load and exported image visually checked. Pointer Events and touch-sized markers are implemented; physical handset touch testing remains outside this desktop-browser harness and is not claimed as passed.
- Manual calculator: 2.50/100 → 250 return, 150 profit, 40%; fractional 3/2 and American +150; ten legs → 1,280 combined and 128,000 return; leg cap and invalid zero rejected. No provider odds.
- Quiz: all ten questions, correct 10/10 scoring, focus progression, copy result and restart. Search: correct result and readable empty state.
- Theme toggles/reload persistence work. All five localized route sets are crawled; EN/PT/ES copy is present. Owner login uses the unchanged private key; signed MX/CO/PE previews show only their two correct pending identities and no `/go` links. Reset restores no commercial cards on unknown GEO. Anonymous Owner access is blocked.
- GEO authorization is verified by secure tests and signed Owner previews, **not physical MX/CO/PE network locations**. No fabricated geographic access claim.
- Field LCP/CLS/INP and actual monthly cost reduction need real post-release observation; viewport checks do not prove Core Web Vitals.

## Image provenance

Hero: original AI-generated anonymous football concept artwork, not a real person or news photograph; local optimized WebP variants (640/1440), no runtime image service. Built-in image generation was used. Prompt intent: anonymous football supporter/player from behind in a green shirt, arms outstretched in a cinematic stadium at dusk; no sponsor/club identity, text or watermark. Files: `public/v2/football-hero-640.webp`, `public/v2/football-hero-1440.webp`.

Social card: built-in image edit of the existing owned LivaSports brand card; exact prompt: “Change ONLY the bottom sentence 'Placares, agenda, classificação e comparação de odds' to exactly 'Histórias, guias e ferramentas para quem vive o futebol'. Preserve the logo, LivaSports wordmark, green brand accent, dark background, upper 'Futebol · Fútbol · Football' line, overall spacing, proportions, typography and professional minimal layout. Do not add any live scores, odds, affiliate claims, extra branding or graphics. Keep wide 1200:630 proportions.” Optimized local output: `src/app/opengraph-image.png`. No provider data or real news claim.

## Release/rollback and outstanding activation

Merge only through reviewed PR with hosted CI and existing Vercel preview; then verify production SHA/domain, pages/tools/accounts/Owner/retired APIs and absence of cron schedules. Record deployment evidence in the PR/final report. No second Vercel/Neon project. Roll back by reviewed revert or prior verified deployment promotion, never reset/force-push or wipe DB. Restoring old code can restore paid jobs, so review schedules before any rollback.

`CLAUDE_AFFILIATE_HANDOFF.md` is the activation contract. All six country/operator slots remain inactive; no legacy destination migrated. Historical postback records/handler remain preserved, but placeholders do not create referrals or revenue.
