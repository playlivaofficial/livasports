# LivaSports Traffic Engine V1

## Scope

Traffic Engine V1 is an owner-reviewed acquisition workflow:

`stored sports/odds data → deterministic ranking → Top 5 / Top 10 → PT-BR content → 9:16 preview → approve/reject/publish status → attributed existing match page`

It does not post to a social platform and it has no external AI dependency. Ordinary page navigation and ranking make zero provider requests. Existing match, competition, team, SEO, odds, affiliate, slip and analytics identities remain authoritative.

## Ranking

All editorial configuration is in `src/growth/config.ts`. A component contributes `weight × strength` and is rounded to one decimal:

| Component | Max points | Evidence |
| --- | ---: | --- |
| Competition | 30 | centrally configured competition slug tier |
| Clubs | 26 | existing route-name slug, collapsed through explicit provider-name aliases |
| Rivalry | 14 | explicit named derby pairs only |
| Stage | 10 | stored stage/round text matched against configured patterns |
| Standings | 6 | stored domestic-league table positions only |
| Proximity | 8 | kickoff distance from an injected `now` |
| Odds | 10 | distinct currently active, verified BR bookmaker feeds |
| Data | 4 | stored logos/season/venue/stage/table completeness |
| Destination | 6 | existing match page is inside the SEO window and has useful current odds |

Terminal, postponed, stale and beyond-horizon fixtures are ineligible. The same snapshot and clock always produce the same score, component lines, reasons and ordering. Ties break by kickoff and public ID.

The Top 5 caps comparable fixtures from one competition at two; the Top 10 cap is four. A fixture at least 12 points above the weakest diverse choice overrides the cap, so diversity never hides an obviously superior event.

## Real data integration

`src/growth/repository.ts` performs a bounded seven-day read from canonical `fixtures`, `competitions`, `seasons`, `teams` and `standings_current`. It reuses the production odds snapshot reader and freshness calculation, so stale, closed, unmapped or GEO-ineligible quotes do not inflate coverage. Canonical PT-BR destination paths come from the existing match route builder. No sports entities are copied into the growth schema.

## Content and asset

`src/growth/content.ts` produces a deterministic PT-BR pack from the ranked snapshot: hook, 15–30 second script, ordered screens, CTA, facts and captions for TikTok, Instagram Reels, YouTube Shorts and editorial social. Optional table/stage/rivalry/odds sentences appear only when their source facts exist. The future rewrite interface is explicit, but V1 registers no paid model or API key.

The protected route `/api/owner/growth/items/<uuid>/asset` uses Next.js 16 `ImageResponse` to render a 1080×1920 PNG with team logos/fallback marks, responsive team-name sizing, competition, Brazil-local kickoff, truthful context, current odds coverage and the LivaSports CTA.

## Attribution

The canonical URL stays parameter-free. Channel copies add:

- `utm_source=tiktok|instagram|youtube|editorial_social`
- `utm_medium=social`
- `utm_campaign=traffic_engine_v1`
- `utm_content=match_<fixture-public-id>`

The existing analytics boot freezes those parameters as first-touch session attribution and classifies `social` medium as social traffic. Existing downstream match/odds/slip/affiliate events remain unchanged.

## Persistence and workflow

Migration `035_traffic_engine_v1.sql` adds only editorial workflow tables:

- `growth_content_items`: immutable revision, input hash, score evidence, fixture snapshot, content pack and canonical URL;
- `growth_content_channels`: channel-specific tracked URL and `DRAFT → APPROVED/REJECTED`, `APPROVED → PUBLISHED`, with reconsideration from rejected to approved;
- `growth_generation_jobs`: renewable single-run lease and generation audit.

Automatic/manual refresh suppresses any fixture generated in the preceding seven days. A transaction-scoped advisory lock makes the duplicate check and revision allocation atomic per fixture. Explicit owner regeneration is the only bypass and creates a new immutable revision rather than overwriting history.

The private `/owner/growth` route reuses the signed owner cookie and displays current Top 5/Top 10 scores, reasons, component breakdown, content, captions, tracked destinations, 9:16 preview and full revision/channel history. Mutations reuse the existing same-origin, HTTPS, JSON and owner-session control-plane rules.

## Automation

Vercel invokes `/api/internal/growth-refresh` at `17 10,16,22 * * *` UTC, corresponding to 07:17, 13:17 and 19:17 in São Paulo. Minute 17 intentionally does not coincide with the existing five-minute odds ticks. The endpoint reuses `CRON_SECRET`, is disabled in previews, takes a single durable lease, reads the database only and reports `providerRequests: 0`. Owner refresh uses the same generation service.

## Deliberately deferred

- TikTok, Instagram and YouTube publishing APIs;
- blind autonomous approval or posting;
- trend/search-volume signals without a verified source;
- external AI rewriting or any paid AI dependency;
- predictions, injuries, unconfirmed lineups and broadcast claims.
