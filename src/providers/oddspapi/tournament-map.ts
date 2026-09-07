interface TournamentRule { id: string; countryCode: 'BR' | 'MX'; match: RegExp; }

const rules: readonly TournamentRule[] = [
  { id: '325', countryCode: 'BR', match: /^(brasileirao serie a|brasileiro serie a|serie a)$/ },
  { id: '373', countryCode: 'BR', match: /^copa do brasil$/ },
  { id: '384', countryCode: 'BR', match: /^(copa )?libertadores( da america)?$/ },
  { id: '27464', countryCode: 'MX', match: /^(liga mx)( apertura)?$/ },
];

export function normalizedProviderName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function resolveOddsPapiTournamentId(countryCode: string, competitionName: string): string | null {
  const normalized = normalizedProviderName(competitionName);
  return rules.find(rule => rule.countryCode === countryCode.toUpperCase() && rule.match.test(normalized))?.id ?? null;
}
