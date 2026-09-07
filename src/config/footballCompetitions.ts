export interface FootballCompetitionTarget {
  key: string;
  slug: string;
  countryCode: 'BR' | 'MX';
  lookupNames: readonly string[];
  enabled: boolean;
  priority: number;
  regional?: boolean;
}

export const FOOTBALL_COMPETITION_TARGETS: readonly FootballCompetitionTarget[] = [
  { key: 'br-serie-a', slug: 'brasileiro-serie-a', countryCode: 'BR', lookupNames: ['Brasileiro Serie A', 'Serie A'], enabled: true, priority: 10 },
  { key: 'br-copa-do-brasil', slug: 'copa-do-brasil', countryCode: 'BR', lookupNames: ['Copa do Brasil'], enabled: true, priority: 20 },
  { key: 'br-copa-libertadores', slug: 'copa-libertadores', countryCode: 'BR', lookupNames: ['Copa Libertadores', 'CONMEBOL Libertadores'], enabled: true, priority: 30, regional: true },
  { key: 'mx-liga-mx', slug: 'liga-mx', countryCode: 'MX', lookupNames: ['Liga MX'], enabled: true, priority: 40 },
];

export const DEFAULT_INGESTION_WINDOW = { daysPast: 7, daysFuture: 14 } as const;
