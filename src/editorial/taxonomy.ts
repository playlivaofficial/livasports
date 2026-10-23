/** Editorial categories are not a promise of live data or an active tournament. */
export const newsSports=['football','basketball','baseball','american-football','ice-hockey','mma','tennis'] as const;
export type NewsSport=typeof newsSports[number];

export const footballTopics={
  'liga-mx':'Liga MX','liga-expansion-mx':'Liga de Expansión MX','leagues-cup':'Leagues Cup',
  'campeon-de-campeones':'Campeón de Campeones','campeones-cup':'Campeones Cup','copa-mx':'Copa MX (archive)',
  'colombia-primera-a':'Liga BetPlay','colombia-primera-b':'Torneo BetPlay','copa-colombia':'Copa BetPlay','superliga-colombia':'Superliga BetPlay',
  'peru-liga-1':'Liga1','peru-liga-2':'Liga2','copa-peru':'Copa Perú','copa-bicentenario':'Copa Bicentenario (archive)',
  'peru-copa-de-la-liga':'Copa Caliente de la Liga','peru-supercopa':'Supercopa Caliente',
  'copa-libertadores':'CONMEBOL Libertadores','copa-sudamericana':'CONMEBOL Sudamericana','recopa-sudamericana':'CONMEBOL Recopa','concacaf-champions-cup':'Concacaf Champions Cup',
  'premier-league':'Premier League','la-liga':'LALIGA','serie-a':'Serie A','bundesliga':'Bundesliga','ligue-1':'Ligue 1',
  'champions-league':'UEFA Champions League','europa-league':'UEFA Europa League','conference-league':'UEFA Conference League',
  'world-cup':'FIFA World Cup','world-cup-qualifiers-conmebol':'World Cup qualifiers · CONMEBOL','world-cup-qualifiers-concacaf':'World Cup qualifiers · Concacaf',
  'world-cup-qualifiers-uefa':'World Cup qualifiers · UEFA','world-cup-qualifiers-afc':'World Cup qualifiers · AFC','world-cup-qualifiers-caf':'World Cup qualifiers · CAF','world-cup-qualifiers-ofc':'World Cup qualifiers · OFC',
  'world-cup-intercontinental-playoffs':'World Cup Play-Off Tournament','world-cup-uefa-playoffs':'World Cup European Play-Offs',
  'world-cup-qualifiers-concacaf-2030':'World Cup qualifiers · Concacaf 2030',
  'euro':'UEFA EURO','euro-2024-archive':'UEFA EURO 2024 (archive)','euro-qualifiers':'UEFA EURO qualifiers','copa-america':'Copa América',
  'uefa-nations-league':'UEFA Nations League','gold-cup':'Concacaf Gold Cup','gold-cup-2025-archive':'Concacaf Gold Cup 2025 (archive)','concacaf-nations-league':'Concacaf Nations League',
  'national-teams':'National teams','grassroots':'Grassroots','football-news':'Football news',
} as const;
export const otherSportTopics={
  nba:{sport:'basketball',name:'NBA'},euroleague:{sport:'basketball',name:'EuroLeague'},
  mlb:{sport:'baseball',name:'MLB'},nfl:{sport:'american-football',name:'NFL'},nhl:{sport:'ice-hockey',name:'NHL'},ufc:{sport:'mma',name:'UFC'},
  'atp-rankings':{sport:'tennis',name:'ATP rankings'},'wta-rankings':{sport:'tennis',name:'WTA rankings'},
  'australian-open':{sport:'tennis',name:'Australian Open'},'roland-garros':{sport:'tennis',name:'Roland-Garros'},
  wimbledon:{sport:'tennis',name:'Wimbledon'},'us-open-tennis':{sport:'tennis',name:'US Open tennis'},
  'atp-masters-1000':{sport:'tennis',name:'ATP Masters 1000'},'wta-1000':{sport:'tennis',name:'WTA 1000'},
  'atp-finals':{sport:'tennis',name:'ATP Finals'},'wta-finals':{sport:'tennis',name:'WTA Finals'},
  'davis-cup':{sport:'tennis',name:'Davis Cup'},'billie-jean-king-cup':{sport:'tennis',name:'Billie Jean King Cup'},
  'basketball-news':{sport:'basketball',name:'Basketball news'},'baseball-news':{sport:'baseball',name:'Baseball news'},
  'american-football-news':{sport:'american-football',name:'American football news'},'ice-hockey-news':{sport:'ice-hockey',name:'Ice hockey news'},
  'mma-news':{sport:'mma',name:'Mixed martial arts news'},'tennis-news':{sport:'tennis',name:'Tennis news'},
} as const satisfies Record<string,{sport:NewsSport;name:string}>;
export type NewsCompetition=keyof typeof footballTopics|keyof typeof otherSportTopics;
export const newsCompetitions=Object.keys({...footballTopics,...otherSportTopics}) as NewsCompetition[];
export function competitionSport(topic:NewsCompetition):NewsSport {
  return Object.hasOwn(otherSportTopics,topic)?otherSportTopics[topic as keyof typeof otherSportTopics].sport:'football';
}
export function topicsForSport(sport:NewsSport){return newsCompetitions.filter(topic=>competitionSport(topic)===sport);}
/** Legacy persisted publications remain byte-for-byte unchanged. */
export function newsSport(item:{sport?:NewsSport}):NewsSport{return item.sport??'football';}
