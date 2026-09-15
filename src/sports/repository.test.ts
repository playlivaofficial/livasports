import {describe,it,expect,vi} from 'vitest';
import {SportsRepository} from './repository';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
vi.mock('server-only',()=>({}));
const season='01234567-89ab-cdef-0123-456789abcdef';
function fixtureDb(seasons:Array<Record<string,unknown>>=[{id:season,name:'2026/2027',is_current:true,fixtures:45}]){
  const query=vi.fn(async(sql:string)=>{
    if(sql.includes('FROM competitions c LEFT'))return {rows:[{id:'competition',slug:'premier-league',competition_type:'DOMESTIC_LEAGUE',coverage_status:'SUPPORTED',country:'England'}]};
    if(sql.includes('FROM seasons s LEFT'))return {rows:seasons};
    if(sql.includes('count(*) FILTER'))return {rows:[{upcoming:12,results:33}]};
    if(sql.includes('jsonb_object_agg'))return {rows:[
      {player_public_id:'a',display_name:'One',team_id:'t',public_id:'team',name:'Team',metrics:{GOALS:{total:5},ASSISTS:{total:0}}},
      {player_public_id:'b',display_name:'Two',team_id:'t',public_id:'team',name:'Team',metrics:{GOALS:{total:5}}},
      {player_public_id:'c',display_name:'Unknown',team_id:'t',public_id:'team',name:'Team',metrics:{APPEARANCES:{total:5}}},
    ]};return {rows:[]};
  });return {query};
}
describe('sports database read model',()=>{
  it('scopes every view to the selected competition and season with bounded pagination',async()=>{
    const db=fixtureDb(),hub=await new SportsRepository(db as never).competition('premier-league','en',season,2);
    expect(hub?.counts).toEqual({upcoming:12,results:33});expect(hub?.providerRequests).toBe(0);
    const calls=db.query.mock.calls as unknown as Array<[string,unknown[]]>;
    const fixtures=calls.filter(([sql])=>sql.includes('OFFSET')&&sql.includes('FROM fixtures f'));expect(fixtures).toHaveLength(2);
    for(const [sql,args] of fixtures){expect(sql).toContain('f.competition_id=$1 AND f.season_id=$2');expect(args).toEqual(['competition',season,30,30]);}
    const pending=calls.find(([sql])=>sql.includes('FROM sports_pending_fixtures p JOIN'));
    expect(pending?.[1]).toEqual([season,30,30]);
    expect(calls.every(([sql])=>/^SELECT/.test(sql))).toBe(true);
  });
  it('preserves ties and unknown statistics honestly',async()=>{
    const hub=await new SportsRepository(fixtureDb() as never).competition('premier-league','en',undefined);
    expect(hub?.scorers.map(p=>p.rank)).toEqual([1,1]);expect(hub?.scorers[0].assists).toBe(0);expect(hub?.scorers[1].assists).toBeNull();
  });
  it('falls back safely when a requested season is unavailable',async()=>{
    const db=fixtureDb(),hub=await new SportsRepository(db as never).competition('premier-league','en','missing');
    expect(hub?.season?.id).toBe(season);expect(hub?.providerRequests).toBe(0);expect(db.query.mock.calls.length).toBeGreaterThan(2);
  });
  it('shows the latest populated season with an explicit fallback only after all next-season capabilities are verified empty',async()=>{
    const rows=[{id:season,name:'2027',is_current:true,fixtures:0,verified_empty:true},{id:'previous',name:'2026',is_current:false,fixtures:100}];
    const hub=await new SportsRepository(fixtureDb(rows) as never).competition('premier-league','en',undefined);
    expect(hub?.season?.name).toBe('2026');expect(hub?.season?.current).toBe(false);expect(hub?.seasonFallback?.name).toBe('2027');
    const requested=await new SportsRepository(fixtureDb(rows) as never).competition('premier-league','en',season);
    expect(requested?.season?.name).toBe('2027');expect(requested?.seasonFallback).toBeNull();
  });
  it.each([{fixtures:0,verified_empty:false},{fixtures:1,verified_empty:true},{fixtures:0,verified_empty:null}])('keeps current seasons with data, pending draws, or unverified coverage: %j',async state=>{
    const db=fixtureDb([{id:season,name:'2027',is_current:true,...state},{id:'previous',name:'2026',fixtures:100}]);
    const hub=await new SportsRepository(db as never).competition('premier-league','en',undefined);
    expect(hub?.season?.id).toBe(season);expect(hub?.seasonFallback).toBeNull();
  });
  it('uses parameterized literal search with no wildcard injection',async()=>{
    const db={query:vi.fn(async()=>({rows:[]}))},repo=new SportsRepository(db as never);
    await repo.search('','en');expect(db.query).not.toHaveBeenCalled();
    await repo.search('x','en');expect(db.query).toHaveBeenCalledTimes(3);
    await repo.search("a%' OR 1=1",'en');expect(db.query).toHaveBeenCalledTimes(6);
    for(const [sql,args] of (db.query.mock.calls as unknown as Array<[string,string[]]>).slice(3)){expect(sql).not.toContain('OR 1=1');expect(args[0]).toContain('a\\%');}
  });
  it('builds competition nav counts from the football window without listing fixtures',async()=>{
    const rows=FOOTBALL_COMPETITION_TARGETS.map(target=>({slug:target.slug,canonical_name:target.canonicalName,display_name_pt_br:target.canonicalName,display_name_es_mx:target.canonicalName,competition_group:target.group,region:target.region,country_code:target.countryCode,country_name:target.countryNames[0]??null,n:target.slug==='premier-league'?13:target.slug==='liga-mx'?2:0}));
    const db={query:vi.fn(async()=>({rows}))};
    const items=await new SportsRepository(db as never).boardNav('br','America/Sao_Paulo');
    expect(items).toHaveLength(34);
    expect(items.find(item=>item.slug==='premier-league')).toMatchObject({name:'Premier League',group:'EUROPE',count:13});
    expect(items.find(item=>item.slug==='liga-mx')).toMatchObject({name:'Liga MX',group:'AMERICAS',count:2});
    expect(items.find(item=>item.slug==='copa-libertadores')?.count).toBe(0);
    const navCall=db.query.mock.calls[0] as unknown as [string,unknown[]];
    expect(navCall[0]).toContain('LEFT JOIN fixtures');expect(navCall[0]).toContain('GROUP BY c.id');expect(navCall[0]).not.toMatch(/^SELECT f\./);
  });
});
