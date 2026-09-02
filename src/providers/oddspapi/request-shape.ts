export function buildOddsByTournamentQuery(tournamentIds: readonly string[], bookmaker: string): Record<string, string> {
  if (!tournamentIds.length) throw new Error('At least one tournament is required');
  if (!bookmaker || bookmaker.includes(',')) throw new Error('OddsPapi requires exactly one bookmaker per request');
  return { tournamentIds: tournamentIds.join(','), bookmaker, language: 'en', verbosity: '3', oddsFormat: 'decimal' };
}
