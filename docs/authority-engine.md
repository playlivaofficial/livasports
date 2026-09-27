# Authority / Backlinks / Brand Distribution

## Baseline — 2026-09-27

Authoritative main and Vercel Production were checked before work: `da969f46e81ea1daeb33a26d423c4fa4d4a48b2e`, deployment `dpl_CnZyFWWz6aq1TrDKMbA1fxA5QFA5`, READY. Implementation is isolated from the older local main.

No existing backlink ledger or authority CRM. GSC search analytics is connected in the product, but the browser's account cannot open the LivaSports Links property. The Search Console API does not provide the UI Links report. No accessible Ahrefs/Semrush/Majestic or other backlink provider was found: competitor backlink-provider data = **NOT_AVAILABLE**. Total web-wide referring domains are unknown, not zero.

Production first-party baseline, previous 28 days: one HUMAN referral session from `www.mamma.com`, landing `/en`; zero engaged sessions, match views, odds interactions, slip additions or bookmaker redirects in that cohort. This is a referral, NOT a confirmed editorial backlink. Direct and Google/Bing organic sessions are not counted as backlinks. No verified editorial LivaSports brand mention was found in the limited public search; an automated new-domain directory is not an outreach target.

Adjacent patterns studied: [Flashscore](https://www.flashscore.com.br/) offers match/competition discovery; [SofaScore](https://www.sofascore.com/pt-pt) offers data-rich match context; [OddsPortal](https://www.oddsportal.com/faq/) explains comparison rather than operating a bookmaker. Do not copy their content or commercial claims.

[Trivela's article about SofaScore](https://trivela.com.br/brasil/notas-analistas-tempo-real-como-funciona-sofascore/) (2024-11-28) is evidence of editorial interest in sports-data methodology. The fetched HTML contained no direct SofaScore hyperlink. This is a **mention**, not a verified competitor backlink gap. Absence of a LivaSports link on one article is not a site-wide gap audit.

## Quality and first batch

30 distinct publisher domains researched, all with observed public editorial/resource URLs and contact paths. Initial classification: 27 HIGH, 3 MEDIUM. HIGH requires named BR, football, editorial, observed activity and public contact signals. MEDIUM retains relevant publishers where the selected evidence is older or weaker. No DA/DR, audience size, rank uplift, acceptance probability or traffic is invented. Article titles are summarized; null dates mean not independently extracted. Source articles and contact pages were verified on publisher sites; a web-index read supplied Meu Timão/Coluna evidence when direct requests returned 403. The monitor does not bypass those blocks.

Research is versioned in `src/authority/prospects.ts`; the owner can correct evidence, notes and contact paths, with append-only change events. Seed is idempotent and never overwrites existing owner edits. Entries start RESEARCHED, never CONTACTED. Public editorial mailboxes were recorded only where explicitly published. Social/profile contact alternatives are labeled; no private email discovery.

Initial owner shortlist: Nosso Palestra, Coluna do Fla, Meu Timão, Footure, UmDois Esportes, NE45, ecBahia, Esporte News Mundo. Review each article and tailor a short relevance sentence before contacting. The general methodology is the honest first asset; do not suggest that it is a club-specific odds report or that it covers youth fixtures.

Deferred/excluded research: old Premier League Brasil redirects to Trivela (no duplicate domain credit); inaccessible sites are not fabricated; Imortais do Futebol's unrelated casino/Angola material warrants manual quality review and was not put into the active batch. No prospect is automatically emailed.

## Asset strategy

| Proposal | Audience / reason to cite | Supporting data | Outreach category | Maintenance / auto refresh |
| --- | --- | --- | --- | --- |
| **Comparison methodology — implemented** | Editors checking comparable markets and timestamps | Existing canonical odds behavior, proxy labels and freshness policy | Media, data writers, betting editorial | Low; editorial review, not automatic claims |
| Existing match comparison deep links — reuse | Preview writers need a specific game's context | Canonical fixture + eligible public odds | Match previews, club media | Existing product refresh; no new route |
| Existing team/competition hubs — reuse | Fans need fixtures and standings | Existing canonical sports data | Club and regional media | Existing ingestion; no new route |
| Weekly price-divergence report | Journalists need a reproducible market snapshot | Requires captured eligible prices, common lines, timestamps and sample-size disclosure | Data/odds media | Medium; bounded batch possible after provenance/rights review |
| Brazil market snapshot | Editors contextualize next round | Existing growth priority + public coverage | Newsletters | Medium; automatic facts with editorial validation |
| Where prices differ | Illustrate price disagreement, not advice | Comparable real public prices only; exclude proxies from cross-book claims | Odds editorial | Medium; freshness and missingness rules required |
| Coverage tracker | Explain where comparison is possible | Public eligible market coverage, not hidden provider labels | Data writers | Medium; could refresh automatically |
| Historical movement | Longitudinal evidence | Reliable timestamped history not established in this audit | Analysts | Defer; never invent past prices |
| Embeddable table/chart | Citation-ready illustration | Rights-approved aggregate plus accessible source table | Media/creators | Defer until the first report is useful; no third-party script widget now |
| Original weekly data story | Specific Brazilian editorial insight | Reproducible report, sample and limitations | Journalists | Editorial maintenance; no filler generation |

The selected implementation strengthens `/br/como-funciona-a-comparacao-de-odds` with comparison protocol, citation checklist, limits, affiliate disclosure and no implied data-redistribution licence. Canonical/hreflang identity is unchanged. Only this BR document's review date changes; other help pages retain their original dates. No new public route family.

## Workflow and safety

Owner route `/owner/growth/authority`, linked from Growth Queue and Growth dashboard. Existing signed owner sessions, no-store/noindex, same-origin POST, strict field allowlist, bounded JSON, HTTPS and existing owner request limit. No new auth, sender/OAuth, subscriptions or social APIs.

Lifecycle: NEW → RESEARCHED → READY_TO_CONTACT → CONTACTED → FOLLOW_UP / INTERESTED / DECLINED / NO_RESPONSE / LINK_LIVE, with explicit review/reopen paths. CONTACTED requires confirmation of a message already sent manually. LINK_LIVE requires a monitor-observed LIVE link. Registering a claimed backlink starts UNKNOWN. Every creation, status change, edit, follow-up date and backlink record appends history in a transaction. Domain and source+target uniqueness prevent duplicates. QA rows are excluded from business KPIs and monitoring.

Six PT-BR template families: data citation, journalist resource, match tool, club resource, newsletter, article update. Subject/message/one follow-up plus an optional interest-only second follow-up; clipboard failure gives selectable text. No claims of broken links without evidence, demands for dofollow, payment promises or guaranteed results. Any recorded spam risk classifies REJECT and blocks contact progression.

## Monitor

Daily at 06:15 UTC; each known source is due weekly. Oldest due links first, one per domain per run, at most five external domains. Maximum 15 external requests plus one own methodology health request. Daily primary-key claim prevents duplicate/concurrent jobs. An interrupted claim is not blindly retried that day. Preview invocations disabled; existing scheduler bearer auth required. Existing odds/growth/SEO schedules unchanged.

HTTPS-only public domains, DNS validation and socket pinning, bounded DNS/network timeouts, 1 MiB response ceiling, no cookies/auth, no redirects followed, robots permission checked, nonzero crawl-delay deferred. Private/reserved addresses and credential-bearing URLs are blocked. No JavaScript or anti-bot bypass. Robots/network/403/429 = UNKNOWN; 3xx = REDIRECTED; missing anchor/404/410 = REMOVED only after a previously verified observation. Anchor text and rel are captured when visible; source/target errors remain explicit. All observations preserved in a ledger. Own target HTTP state is captured separately.

## Measurement

Uses existing analytics only: HUMAN sessions joined to pre-aggregated HUMAN events, existing acquisition bucket SQL, domain normalized with the Public Suffix List. Counts referral sessions, engaged sessions, match views, odds selections, slip adds and confirmed outbound redirects. OWNER, QA, BOT, paid and social channels are excluded. No affiliate postback/FTD/revenue attribution claims. The dashboard shows known links, new/lost links, contact/response state, follow-ups, domain/landing funnel and transparent Wins/Watchlist/Issues. Referrals may exist without a link; links may exist without traffic.

## First 20–30 quality referring domains — plan, not a promise

1. First two weeks: manually validate and contact 8–10 best fits, 2–3 carefully tailored messages per working day maximum. Start with a useful resource; no quota-driven messages. Record all responses.
2. Offer a single follow-up after 7–10 business days; stop on rejection or no fit. A second follow-up only after explicit interest. Measure responses by domain, not send volume.
3. Aim over successive editorial cycles for 6–8 club/fan domains, 5–7 sports/data domains, 2–4 creators/newsletters, 3–4 betting-editorial domains, 4–6 regional domains. These overlap; deduplicate by registrable domain. Do not count publisher subdomains as separate wins.
4. Thirty prospects are a starting batch, not enough to promise 20–30 acceptances. Expand toward 80–120 individually researched prospects only as relevance and responses justify it; do not pad weak categories. Add the first reproducible data report only after recurring editorial demand emerges.
5. Verify earned source+target anchors; evaluate HUMAN engagement and bookmaker redirects at 28 days. Use learnings to refine asset/pitch choice, never buy bulk links or fabricate authority metrics.

## Verification / operations

`scripts/authority-cli.ts`: validate, db-qa (always rolled back), migrate (only additive 047, atomic ledger), seed (additive, skip existing), verify, monitor. Run with the restricted `scripts/authority-preload.mjs`; never put it in production NODE_OPTIONS. Production serving uses normal server-only boundaries.

Known limits: no web-wide backlink index; no GSC Links import until owner can export it; no competitor provider; one current reference article per prospect; some contact paths are general or professional-social rather than direct editorial mailboxes. Static HTML monitoring cannot see JS-only links. No automatic email or publishing. Initial UI bounded to 1,000 prospects/links, 2,000 history events and 1,000 domain/landing rows; counts are known-snapshot counts, not an unlimited warehouse report. Extend pagination before exceeding these bounds.
