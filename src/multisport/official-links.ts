export interface OfficialCompetitionLink {
 readonly url:string;
 /** A governing-body directory must not be labelled as a competition-specific website. */
 readonly scope:'competition'|'governing-body';
}
const competition=(url:string):Readonly<OfficialCompetitionLink>=>Object.freeze({url,scope:'competition'});
const governingBody=(url:string):Readonly<OfficialCompetitionLink>=>Object.freeze({url,scope:'governing-body'});

/**
 * Exact public URLs retained in docs/v3-research-{football-global,latam,multisport}.json
 * (audit 2026-10-19). Articles, regulations and historical reports are legitimate official
 * references, not promises of a current feed. No URL is derived by trimming a provider URL.
 * Linking does not grant data, logo, photograph or article-reproduction rights.
 * Keep this separate from catalog.sourceUrl: that field is dataset provenance used by validators.
 */
export const OFFICIAL_COMPETITION_LINKS:Readonly<Record<string,Readonly<OfficialCompetitionLink>|null>>=Object.freeze({
 // Global football: use the audited format evidence, never OpenFootball or football-data coverage.
 'premier-league':competition('https://www.premierleague.com/en/news/4675508/premier-league-fixture-schedulereleased-for-season-202627'),
 'la-liga':competition('https://www.laliga.com/laliga-easports/clasificacion'),
 'serie-a':competition('https://en.legaseriea.it/serie-a/news/looking-forward-to-the-2026-27-serie-a-fixture-list'),
 bundesliga:competition('https://www.bundesliga.com/en/bundesliga/news/calendar-for-2026-27-season-world-cup-34676'),
 'ligue-1':competition('https://ligue1.com/en/articles/l1_article_5292-the-2026-27-ligue-1-mcdonald-s-calendar-is-released'),
 'champions-league':competition('https://www.uefa.com/uefachampionsleague/news/02a6-20d57cfcd03e-407c22a7f465-1000--2026-27-champions-league-teams-dates-draws-format-final/'),
 'europa-league':competition('https://fr.uefa.com/uefaeuropaleague/news/02a6-20d57fc43cc7-d8603047ae4d-1000--ligue-europa-2026-27-equipes-dates-tirages-format-et-finale/'),
 'conference-league':competition('https://www.uefa.com/uefaconferenceleague/news/02a6-20d57d15f093-a90cf54c928f-1000--2026-27-conference-league-teams-dates-draws-format-final/'),
 'world-cup':competition('https://www.fifa.com/en/articles/article-fifa-world-cup-2026-mexico-canada-usa-new-format-tournament-football-soccer?pubDate=20250524'),
 'world-cup-qualifiers-conmebol':competition('https://www.fifa.com/en/tournaments/mens/worldcup/articles/south-america-conmebol-qualifying-qualifiers-dates-teams-places-world-cup-2026'),
 'world-cup-qualifiers-concacaf':competition('https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/concacaf-qualifying-preview-third-round?searchOverlay=1'),
 'world-cup-qualifiers-uefa':competition('https://www.uefa.com/european-qualifiers/news/0292-1c1a655f1be0-84538c15a736-1000--european-qualifiers-for-the-2026-fifa-world-cup-all-you-ne/'),
 'world-cup-qualifiers-afc':competition('https://www.fifa.com/en/articles/afc-qualifying-world-cup-26'),
 'world-cup-qualifiers-caf':competition('https://www.cafonline.com/news/caf-reveals-new-format-for-2026-fifa-world-cup-qualifiers/'),
 'world-cup-qualifiers-ofc':competition('https://www.oceaniafootball.com/fifa-world-cup-2026-oceania-qualifiers-2/'),
 'world-cup-intercontinental-playoffs':competition('https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/fifa-play-off-tournament-schedule/'),
 'world-cup-uefa-playoffs':competition('https://www.uefa.com/european-qualifiers/news/0292-1c1a655f1be0-84538c15a736-1000--european-qualifiers-for-the-2026-fifa-world-cup-all-you-ne/'),
 euro:competition('https://www.uefa.com/euro2028/news/0299-1dcf3fef69a9-41405d004b47-1000/'),
 // The 2024 archive audit retained only OpenFootball links; a 2028 article is not its official page.
 'euro-2024-archive':null,
 'euro-qualifiers':competition('https://www.uefa.com/euro2028/news/0299-1dcf3fef69a9-41405d004b47-1000/'),
 'copa-america':competition('https://copaamerica.com/pdf/CA2024-Reglamento-en.pdf'),
 'uefa-nations-league':competition('https://www.uefa.com/uefanationsleague/news/0298-1d6ef1acfaef-b54fcf1da859-1000--2026-27-uefa-nations-league-all-you-need-to-know/'),
 'gold-cup':competition('https://www.concacaf.com/competitions/gold-cup/news/2027-concacaf-gold-cup-qualification-pathway-confirmed'),
 'gold-cup-2025-archive':competition('https://www.concacaf.com/competitions/gold-cup/news/2025-concacaf-gold-cup-all-you-need-to-know'),
 'concacaf-nations-league':competition('https://www.concacaf.com/competitions/gold-cup/news/2027-concacaf-gold-cup-qualification-pathway-confirmed'),
 'world-cup-qualifiers-concacaf-2030':competition('https://www.concacaf.com/news/concacaf-anuncia-calendario-de-competiciones-de-selecciones-nacionales-masculinas-del-2026-2030'),

 // LATAM: canonical IDs differ from five audit IDs; the exact audited URLs are preserved.
 'liga-mx':competition('https://ligamx.net/'),
 'liga-expansion-mx':competition('https://www.ligabbvaexpansion.mx/'),
 'leagues-cup':competition('https://www.leaguescup.com/about/'),
 // Do not send readers to the merchandise listing used as limited historical evidence.
 'campeon-de-campeones':governingBody('https://ligamx.net/cancha/reglamentos'),
 'campeones-cup':competition('https://www.leaguescup.com/campeonescup/'),
 'copa-mx':competition('https://subinternacional.ligamx.net/cancha/detallenoticia/33547/rayados-con-contundente-pase-a-los-cuartos-de-final'),
 'colombia-primera-a':competition('https://www.dimayor.com.co/2026/01/14/reglamento-liga-betplay-dimayor-2026/'),
 'colombia-primera-b':competition('https://www.dimayor.com.co/torneo-betplay-dimayor/'),
 'copa-colombia':competition('https://dimayor.com.co/2026/05/04/definidos-los-grupos-y-el-fixture-de-la-copa-betplay-dimayor-2026/'),
 'superliga-colombia':competition('https://dimayor.com.co/superliga-betplay-dimayor/'),
 'peru-liga-1':competition('https://liga1.pe/tabla-de-posiciones/'),
 'peru-liga-2':competition('https://liga2.pe/'),
 'copa-peru':competition('https://fpf.org.pe/biblioteca/reglamento-copa-peru-2026/'),
 'copa-bicentenario':governingBody('https://fpf.org.pe/ligas/'),
 'peru-copa-de-la-liga':competition('https://lfpp.pe/copa-caliente-de-la-liga/'),
 'peru-supercopa':competition('https://lfpp.pe/passline-se-convierte-en-socio-estrategico-de-la-liga-de-futbol-profesional-peruana-hasta-2028/'),
 'copa-libertadores':competition('https://gol.conmebol.com/libertadores/es'),
 'copa-sudamericana':competition('https://gol.conmebol.com/sudamericana/es'),
 'recopa-sudamericana':competition('https://gol.conmebol.com/sudamericana/pt-br/news/lanus-e-campeao-da-conmebol-recopa-de-2026'),
 'concacaf-champions-cup':competition('https://www.concacaf.com/competitions/champions-cup/index'),

 // Other sports: official references only, never an undocumented statistics endpoint.
 nba:competition('https://www.nba.com/news/key-dates'),
 euroleague:competition('https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24407'),
 // The MLB audit does not retain the exact public schedule URL; its Stats API is not a website CTA.
 mlb:null,
 nfl:competition('https://www.nfl.com/schedules/2026/by-week/week-6'),
 nhl:competition('https://www.nhl.com/news/nhl-nationally-televised-games-for-week-of-october-5-2026'),
 ufc:competition('https://www.ufc.com/news/ufc-and-meta-unveil-meta-ufc-rankings'),
 'atp-rankings':competition('https://www.atptour.com/en/rankings/singles'),
 'wta-rankings':competition('https://www.wtatennis.com/rankings'),
 'australian-open':competition('https://ausopen.com/'),
 'roland-garros':competition('https://www.rolandgarros.com/'),
 wimbledon:competition('https://www.wimbledon.com/en_GB/scores/schedule/schedule10.html?external=true'),
 'us-open-tennis':competition('https://www.usopen.org/'),
 'atp-masters-1000':governingBody('https://www.atptour.com/en/scores/results-archive'),
 'wta-1000':governingBody('https://www.wtatennis.com/tournaments'),
 'atp-finals':governingBody('https://www.atptour.com/en/scores/results-archive'),
 'wta-finals':competition('https://www.wtatennis.com/tournaments/wta-finals'),
 'davis-cup':competition('https://www.daviscup.com/'),
 'billie-jean-king-cup':competition('https://www.billiejeankingcup.com/en'),
});

export function officialCompetitionLink(id:string):Readonly<OfficialCompetitionLink>|null{
 return Object.hasOwn(OFFICIAL_COMPETITION_LINKS,id)?OFFICIAL_COMPETITION_LINKS[id]:null;
}
export function officialCompetitionUrl(id:string):string|null{return officialCompetitionLink(id)?.url??null;}
