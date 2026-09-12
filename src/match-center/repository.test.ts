import { describe, expect, it, vi } from 'vitest';
import { PostgresMatchCenterRepository } from './repository';

vi.mock('server-only', () => ({}));

describe('fixture player statistic read model', () => {
  it('uses the provider average for ratings and preserves verified zero values', async () => {
    const database = {
      query: async (sql: string) => {
        if (sql.includes('FROM fixture_player_statistics fps') && sql.includes('JOIN players p')) {
          return { rows: [
            { player_id: 'player', public_id: '0123456789abcdef', display_name: 'Jogador', team_id: 'team', team_name: 'Flamengo',
              developer_name: 'RATING', statistic_name: 'Rating', value: { total: 10, average: 7.42 } },
            { player_id: 'player', public_id: '0123456789abcdef', display_name: 'Jogador', team_id: 'team', team_name: 'Flamengo',
              developer_name: 'GOALS', statistic_name: 'Goals', value: { total: 0 } },
          ] };
        }
        return { rows: [] };
      },
    };

    const result = await new PostgresMatchCenterRepository(database as never).playerPerformances('fixture');
    expect(result[0]?.statistics).toEqual([
      { code: 'RATING', label: 'Rating', value: 7.42 },
      { code: 'GOALS', label: 'Goals', value: 0 },
    ]);
  });
});
