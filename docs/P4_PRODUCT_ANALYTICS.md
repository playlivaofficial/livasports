# P4 — Product analytics & conversion funnel

First-party, privacy-first measurement of acquisition → sports content → odds → My Slip → bookmaker comparison →
affiliate outbound click, plus sign-in, favorites and returning behaviour. No third-party trackers (no GA4, no pixels).

## 1. Audit of what existed (2026-09-18)

| Capability | State before P4 | P4 outcome |
| --- | --- | --- |
| `product_events` (M4–M7: match/odds/slip/comparison events, br/mx only, no session) | ALREADY PRESENT, PARTIAL for funnel work | kept unchanged for its existing consumers; its client emitters now also feed the P4 taxonomy through one bridge (no double writes of the same logical event into two contracts by different code paths) |
| `/api/events` single-event boundary (legacy + affiliate impression/embed click) | ALREADY PRESENT | reused: P4 batches (`{v:1,batch:[…]}`) share the boundary |
| `affiliate_clicks` / `affiliate_impressions` ledgers with `traffic_class`, `/go/*` signed outbound, QA_TEST marking | ALREADY PRESENT | untouched commercial source of truth; the P4 `outbound_redirect_completed` server event is written inside the same deferred task |
| `affiliate_conversion_events` (operator-verified registrations/FTD/revenue, no public receiver) | ALREADY PRESENT | untouched; never mixed with clicks in reporting |
| Campaign attribution (`affiliate_campaigns`, offer tokens) | ALREADY PRESENT | `campaign_id` carried on affiliate events |
| GEO attribution (`requestCommercialGeo`: BR/MX from request country, owner preview → BR) | ALREADY PRESENT | reused as `geo` |
| Referrer / UTM handling | MISSING | referrer classes + UTM normalization, frozen first-touch per session, last-touch campaign |
| Sessions / anonymous identity / returning visitors | MISSING | `analytics_sessions`, `ls_aid` (1 y) + `ls_sid` (30 min) first-party cookies mirrored in localStorage |
| Auth / favorites / My Matches / search events | MISSING | server events for sign-in/out and favorites; client events for sign-in start, search, My Matches views |
| Analytics providers | none | none added |
| Owner reporting route | MISSING | `/owner/analytics` (existing owner auth) |
| Bot / QA / owner traffic separation for product analytics | PARTIAL (affiliate only) | `traffic_class` on every event and session |

## 2. Taxonomy v1 (27 events)

Client (22): `session_started`, `returning_session_started`, `landing_viewed`, `page_viewed`, `competition_viewed`,
`team_viewed`, `player_viewed`, `match_viewed`, `search_used`, `odds_visible`, `odds_selected`,
`bookmaker_comparison_viewed`, `slip_created`, `slip_leg_added`, `slip_leg_removed`, `slip_cleared`, `stake_changed`,
`slip_opened`, `affiliate_cta_viewed`, `affiliate_cta_clicked`, `sign_in_started`, `my_matches_viewed`.
Server-only (5, rejected if a client sends them): `outbound_redirect_completed`, `sign_in_completed`,
`sign_out_completed`, `favorite_added`, `favorite_removed`.

Contract (`src/analytics/taxonomy.ts`): event id (uuid), name, version, occurred_at, session_id, anonymous_id,
locale, page_type, canonical_path, referrer_class, utm_*, optional competition/fixture/team/player public ids (resolved
to internal ids server-side), bookmaker, market, outcome, price kind (REAL/PROXY), slip leg count, comparison state
(REAL_COMPLETE / ESTIMATED_COMPLETE / INCOMPLETE), campaign id, placement, small typed props. Anything that looks
like a token, secret, cookie, authorization header or e-mail address rejects the whole event. `user_id` is never
accepted from the client; it is resolved from the auth session at ingestion.

## 3. Identity, sessions, attribution

* Ordinary first-party identifiers only: no canvas/font/hardware fingerprinting.
* Session window 30 minutes of inactivity; a new session freezes landing page, referrer class/host and UTM
  (first-touch). Internal navigation never rewrites the source. `last_utm_campaign` keeps last-touch.
* Visitor kind: NEW (first session on this browser) / RETURNING (a previous session existed). Authenticated sessions
  carry `user_id`; a guest session is linked to the user at sign-in via `COALESCE(user_id, …)` scoped to the same
  anonymous id — other visitors' history is never rewritten. D1/D7/D30 cohorts can be derived from
  `analytics_sessions(anonymous_id|user_id, started_at)`.
* Referrer classes: google_organic, bing_organic, other_search, direct, social, referral, paid (UTM medium), internal.
  Organic keywords stay in Search Console; nothing is scraped or fabricated.
* DNT / Global Privacy Control are honoured by the client and by server-side affiliate events.

## 4. Ingestion and quality

`POST /api/events` with `{v:1,batch:[…]}` (≤ 25 events, ≤ 2 KB each, 64 KB body): same-origin only, allowlist,
schema validation, `event_id` dedupe (`ON CONFLICT DO NOTHING`), 240 events/minute per anonymous id, traffic class
(OWNER via owner cookie, QA via `x-livasports-qa: 1`, BOT via user-agent/prefetch, else HUMAN), entity resolution,
session upserts, hourly quality counters (accepted, duplicates, rejected, unknown types, missing session ids,
oversized, server events, max lag). The dashboard raises flags: sessions without page views, duplicate rate > 20%,
rejection rate > 10%, unknown types, missing session ids, lag > 15 min, client clicks without server redirects, no
events for 6 h. Analytics failures return 4xx/5xx to the beacon only; nothing in the product awaits them.

## 5. Owner dashboard

`/owner/analytics` — owner session only, `noindex`, robots-disallowed, excluded from sitemaps, providerRequests 0.
Windows today / 7 d / 30 d; filters locale, GEO, bookmaker, competition, landing page type, source, traffic class.
Cards, funnel (sessions → content → odds selection → slip → comparison → affiliate click with stage and session
conversion), leg buckets, comparison states, acquisition + UTM campaigns, locale/GEO, top landing pages /
competitions / matches / teams / placements / bookmakers (rates hidden under n < 20), data quality. Registrations,
FTDs and revenue are never shown (they belong to operator-verified affiliate feeds).

## 6. Performance

Client modules minified: taxonomy 7.3 KB / 3.0 KB gzip, client 6.8 KB / 2.6 KB gzip, boot 0.3 KB — ≤ 5.8 KB gzip
added to the shared bundle before tree-shaking of the server-only validator. Events are queued and flushed after
1.5 s with `keepalive` (or `sendBeacon` on page hide); nothing blocks rendering or navigation. Reporting uses bounded,
indexed SQL aggregates only.

## 7. Release evidence

Recorded in the P4 final report (deployment id, SHA, production QA, gate counts).
