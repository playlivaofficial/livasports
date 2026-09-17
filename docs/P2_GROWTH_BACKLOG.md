# P2 — 30-day organic discovery backlog

Scope: existing entity pages and the three help topics. No keyword-volume tool or Search Console data was available while preparing this list, so **volume and difficulty are UNKNOWN for every row**; priority is based on market order (BR → MX → EN), data already persisted, and how directly a page serves the search → page → odds comparison → outbound journey. No traffic, ranking or revenue is promised.

| # | Market | Query intent (examples) | Target URL (existing unless marked NEW) | Required factual content already available / to enrich | Internal-link opportunities | Priority rationale |
|---|---|---|---|---|---|---|
| 1 | BR | "tabela brasileirão", "classificação série a" | `/br/futebol?competition=brasileirao-serie-a&tab=standings` | stored standings, form; keep updated-at note | home board competition header, team pages (current-season chips already link here) | Highest BR intent; page exists and is now self-canonical |
| 2 | BR | "jogos do brasileirão hoje / próxima rodada" | `/br/futebol?competition=brasileirao-serie-a` | upcoming rows + odds 1X2 + recent results | today board, match pages breadcrumb | Entry hub; direct odds journey |
| 3 | BR | "brasileirão série b tabela / jogos" | `…competition=brasileirao-serie-b` (+`&tab=standings`) | same as 1–2 | competition nav | Second BR league, less competition |
| 4 | BR | "copa do brasil jogos / resultados" | `…competition=copa-do-brasil` (+`&tab=results`) | results pagination now indexable per page | match pages | Cup intent peaks per round |
| 5 | BR | "libertadores tabela / jogos" | `…competition=copa-libertadores&tab=standings` | group standings with stage labels | BR club team pages | Cross-market (BR+MX) |
| 6 | BR | "flamengo jogos", "palmeiras próximo jogo" (top-6 BR clubs) | `/br/time/<slug>-<id>` | fixtures/results history, squad, competitions; enrich with visible "next match" line if kickoff stored | match ↔ team ↔ competition (exists) | Team pages are the strongest evergreen entities |
| 7 | BR | "escalação flamengo x palmeiras", "flamengo x palmeiras palpite" (we answer facts, not tips) | `/br/jogo/<slug>-<id>` | lineups/stats when stored; keep truthful "escalação indisponível" | competition + team links (exist) | Match pages drive odds comparison; sitemap coverage complete |
| 8 | MX | "tabla liga mx", "tabla general apertura" | `/mx/futbol?competition=liga-mx&tab=standings` | Apertura/Clausura stage labels already localised | MX club pages | Highest MX intent |
| 9 | MX | "partidos liga mx hoy / jornada" | `/mx/futbol?competition=liga-mx` | upcoming + results | today board | Entry hub MX |
| 10 | MX | "goleadores liga mx" | `…competition=liga-mx&tab=scorers` | season top scorers | player pages | Distinct tab now indexable |
| 11 | MX | "américa vs chivas", "club américa partidos" (top MX clubs) | `/mx/equipo/<slug>-<id>` and match pages | history, squad | as 6–7 | MX entity coverage |
| 12 | MX | "concacaf champions cup partidos" | `…competition=concacaf-champions-cup` | fixtures/results | MX team pages | Regional cup |
| 13 | EN | "premier league fixtures/results/standings" | `/en/football?competition=premier-league` (+tabs) | complete | competition nav | Supporting international discovery; heavy competition, low priority |
| 14 | EN | "champions league standings" | `…competition=champions-league&tab=standings` | league-phase table | team pages | Same |
| 15 | BR/MX/EN | "como funciona comparação de odds", "cómo leer cuotas decimales" | help pages (NEW in P2) | shipped | footer, help ↔ help, help → football | Trust/utility intent; supports the comparison journey without editorial filler |
| 16 | BR/MX/EN | "favoritos meus jogos livasports" (brand/product) | `/br/favoritos-e-meus-jogos` (NEW) | shipped | My Matches lead (optional follow-up), footer | Product education |
| 17 | BR | Player intent for top scorers ("artilheiro brasileirão") | `/br/jogador/<slug>-<id>` via scorers tab | statistics present; keep `noindex` for stat-less profiles | scorers tab → player (exists) | Long tail |
| 18 | ALL | Historical seasons ("tabela brasileirão 2025") | `…&season=<id>` (now self-canonical, crawlable via season links) | stored history | season link list (P2) | Evergreen long tail; zero new pages |

Guardrails for every item: enrich only with persisted data; no predictions, injuries, broadcast rights, transfer facts or expert bylines; keep the sports board above any explanatory text; no all-to-all linking.

## Measurement plan (post-launch, weekly for 30 days)

* Search Console: impressions, clicks, CTR and average position by country and by landing-page family (hub, competition tab, match, team, player, help); indexed canonical pages vs. excluded reasons; hreflang/alternate errors.
* Production QA rerun of `scripts/p2-seo-http-qa.ts https://livasports.com --budget=240` after each deploy touching routing or metadata.
* Existing product analytics: outbound `/go` clicks and slip events by landing page (no new analytics build in P2).
* Volume/difficulty: record from Search Console once ≥28 days of data exist; until then keep UNKNOWN.
