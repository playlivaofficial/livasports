/** Fixed, audited factual table pages. No network or server imports: safe for policy validation. */
export interface WikimediaDataset {
  competitionId: string;
  sport: 'football' | 'basketball' | 'baseball' | 'american-football' | 'ice-hockey' | 'mma' | 'tennis';
  season: string;
  sourceUrl: string;
  titles: readonly string[];
  historical?: boolean;
}

export const WIKIMEDIA_DATASETS: readonly Readonly<WikimediaDataset>[] = Object.freeze([
  {
    competitionId: 'liga-mx', sport: 'football', season: 'Apertura 2026 (2026-2027)',
    sourceUrl: 'https://en.wikipedia.org/wiki/Template:Apertura_2026_Liga_MX_table',
    titles: Object.freeze(['Template:Apertura 2026 Liga MX table']),
  },
  {
    competitionId: 'nfl', sport: 'american-football', season: '2026',
    sourceUrl: 'https://en.wikipedia.org/wiki/2026_NFL_season',
    titles: Object.freeze(['AFC', 'NFC'].flatMap(conference => ['East', 'North', 'South', 'West'].map(division => `Template:2026 ${conference} ${division} standings`))),
  },
  {
    competitionId: 'mlb', sport: 'baseball', season: '2026', historical: true,
    sourceUrl: 'https://en.wikipedia.org/wiki/2026_Major_League_Baseball_season',
    titles: Object.freeze(['AL', 'NL'].flatMap(league => ['East', 'Central', 'West'].map(division => `Template:2026 ${league} ${division} standings`))),
  },
  {
    competitionId: 'nhl', sport: 'ice-hockey', season: '2026/27',
    sourceUrl: 'https://en.wikipedia.org/wiki/Template:2026%E2%80%9327_NHL_standings',
    titles: Object.freeze(['Template:2026–27 NHL standings']),
  },
  {
    competitionId: 'atp-rankings', sport: 'tennis', season: '2026',
    sourceUrl: 'https://en.wikipedia.org/wiki/Current_tennis_rankings',
    titles: Object.freeze(['Current tennis rankings']),
  },
  {
    competitionId: 'wta-rankings', sport: 'tennis', season: '2026',
    sourceUrl: 'https://en.wikipedia.org/wiki/Current_tennis_rankings',
    titles: Object.freeze(['Current tennis rankings']),
  },
  {
    competitionId: 'euroleague', sport: 'basketball', season: '2026/27',
    sourceUrl: 'https://en.wikipedia.org/wiki/2026%E2%80%9327_EuroLeague_regular_season',
    titles: Object.freeze(['2026–27 EuroLeague regular season']),
  },
  {
    competitionId: 'ufc', sport: 'mma', season: '2026',
    sourceUrl: 'https://en.wikipedia.org/wiki/UFC_rankings',
    titles: Object.freeze(['UFC rankings']),
  },
].map(dataset => Object.freeze(dataset)) as Readonly<WikimediaDataset>[]);
