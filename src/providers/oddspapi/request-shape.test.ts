import { describe, expect, it } from 'vitest';
import { buildOddsByTournamentQuery } from './request-shape';

describe('OddsPapi request boundary', () => {
  it('uses singular bookmaker and batches tournaments', () => {
    const query = buildOddsByTournamentQuery(['325', '373', '384'], 'betsson');
    expect(query).toMatchObject({ tournamentIds: '325,373,384', bookmaker: 'betsson' });
    expect(query).not.toHaveProperty('bookmakers');
  });

  it('rejects multiple bookmakers in one provider call', () => {
    expect(() => buildOddsByTournamentQuery(['325'], 'betano.bet.br,betsson')).toThrow(/exactly one bookmaker/);
  });
});
