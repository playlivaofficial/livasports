import { describe, expect, it, vi } from 'vitest';
import { PostgresMatchCenterRepository } from './repository';

vi.mock('server-only', () => ({}));

describe('fixture player statistic read model', () => {
  it('keeps separate lineup statistics when the provider has not supplied a global player identity',async()=>{
    const database={query:async(sql:string)=>({rows:sql.includes('FROM fixture_lineups fl')?[
      {provider_lineup_id:1,team_id:'team',player_name:'Same name',lineup_type:'STARTER',unlinked_statistics:[{type:{developer_name:'GOALS',name:'Goals'},data:{value:0}}]},
      {provider_lineup_id:2,team_id:'team',player_name:'Same name',lineup_type:'SUBSTITUTE',unlinked_statistics:[{type:{developer_name:'MINUTES_PLAYED',name:'Minutes'},data:{value:33}}]},
    ]:[]})};
    const [team]=await new PostgresMatchCenterRepository(database as never).lineups('fixture');
    expect(team.starters[0].playerPublicId).toBeNull();expect(team.substitutes[0].playerPublicId).toBeNull();
    expect(team.starters[0].statistics).toEqual([{code:'GOALS',label:'Goals',value:0}]);
    expect(team.substitutes[0].statistics).toEqual([{code:'MINUTES_PLAYED',label:'Minutes',value:33}]);
  });
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
