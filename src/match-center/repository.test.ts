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

describe('M1 next-match lookup', () => {
  const header={id:'fixture-1',competitionId:'competition-1',locale:'br',
    home:{id:'team-home'},away:{id:'team-away'}} as never;
  const run=async(rows:Record<string,unknown>[]=[])=>{
    const query=vi.fn(async()=>({rows}));
    const result=await new PostgresMatchCenterRepository({query} as never).nextMatches(header);
    return {sql:(query.mock.calls[0] as unknown as [string])[0],values:(query.mock.calls[0] as unknown as [string,unknown[]])[1],result};
  };
  it('prefers a fixture involving either team, then the same competition, soonest first',async()=>{
    const {sql}=await run();
    expect(sql).toContain('CASE WHEN f.home_team_id IN ($2,$3) OR f.away_team_id IN ($2,$3) THEN 0 ELSE 1 END AS relation_rank');
    expect(sql).toContain('ORDER BY relation_rank,f.kickoff');
    expect(sql).toContain('f.competition_id=$4');
  });
  it('only offers upcoming, covered, non-pending fixtures and never the match itself',async()=>{
    const {sql,values}=await run();
    expect(sql).toContain("f.status='SCHEDULED'");expect(sql).toContain('f.kickoff>=now()');
    expect(sql).toContain('f.id<>$1');
    expect(sql).toContain("c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')");
    expect(sql).toContain('sports_pending_fixtures');
    expect(values).toEqual(['fixture-1','team-home','team-away','competition-1','br']);
  });
  it('stays compact and reports why each fixture was chosen',async()=>{
    const {sql,result}=await run([
      {public_id:'aaaaaaaaaaaaaaaa',kickoff:'2026-10-01T19:00:00.000Z',competition_slug:'liga-mx',competition_name:'Liga MX',
        home_public_id:'h',home_name:'H',away_public_id:'a',away_name:'A',relation_rank:0},
      {public_id:'bbbbbbbbbbbbbbbb',kickoff:'2026-10-02T19:00:00.000Z',competition_slug:'liga-mx',competition_name:'Liga MX',
        home_public_id:'c',home_name:'C',away_public_id:'d',away_name:'D',relation_rank:1},
    ]);
    expect(sql).toContain('LIMIT 3');
    expect(result.map(row=>row.relation)).toEqual(['TEAM','COMPETITION']);
    expect(result[0]).toMatchObject({publicId:'aaaaaaaaaaaaaaaa',competitionSlug:'liga-mx',home:{name:'H'},away:{name:'A'}});
  });
});
