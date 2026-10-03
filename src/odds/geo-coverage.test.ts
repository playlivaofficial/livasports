import {describe,it,expect,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
import {readGeoCoverageInputs} from './geo-coverage';
const now=new Date('2026-10-04T10:00:00Z');
describe('GEO reliability uses the public country/feed boundary',()=>{
  it('keeps identical fixture coverage separate, complete markets honest, and the approved 32 per GEO',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT c.iso2')?
      [{geo:'CO',operator_id:'betsson',provider_bookmaker_id:'betsson.co',source_domains:['betsson.co']}]:[
        {geo:'CO',slug:'brasileirao-serie-a',id:'f1',kickoff:'2026-10-04T12:00:00Z',tournament_id:'325',provider_bookmaker_id:'betsson.co',current_count:1,stored_count:1,mw:false,ou:false,btts:false},
        {geo:'MX',slug:'brasileirao-serie-a',id:'f1',kickoff:'2026-10-04T12:00:00Z',tournament_id:'325',current_count:null,stored_count:null},
        {geo:'PE',slug:'brasileirao-serie-a',id:'f1',kickoff:'2026-10-04T12:00:00Z',tournament_id:'325',current_count:null,stored_count:null},
      ]}));
    const inputs=await readGeoCoverageInputs({query} as unknown as QueryExecutor,now);
    expect(inputs).toHaveLength(96);expect(inputs.filter(c=>c.geo==='CO')).toHaveLength(32);
    expect(inputs.find(c=>c.competition==='CO:brasileirao-serie-a')).toMatchObject({operatorFeeds:['betsson.co'],nativeCounts:{'betsson.co':1},windows:{'7d':{fixtures:1,anyOdds:1,matchWinner:0,proxyOnly:0}}});
    expect(inputs.find(c=>c.competition==='MX:brasileirao-serie-a')).toMatchObject({operatorFeeds:[],windows:{'7d':{fixtures:1,anyOdds:0,neither:1}}});
    expect(inputs.some(c=>c.canonicalCompetition==='saudi-pro-league-playoffs'||c.canonicalCompetition==='brasileirao-serie-b')).toBe(false);
    const sql=query.mock.calls[1][0];
    // The strict quote predicate reads f.status through the fx CTE, not directly from fixtures.
    expect(sql).toMatch(/fx AS \(SELECT[^]*?f\.kickoff,f\.status,c\.slug/);
    for(const guard of ['odds_geo_current','e.geo=o.geo','e."providerBookmakerId"=o.provider_bookmaker_id','e."sourceDomains"','o.mapping_verified','hm.livasports_entity_id=f.home_team_id','am.livasports_entity_id=f.away_team_id','cm.livasports_entity_id=f.competition_id','freshness_ttl_minutes'])expect(sql).toContain(guard);
    expect(sql).not.toMatch(/\bFROM odds_current\b/);
  });
});
