import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {bettingEvidence,demandProfile,emptyWindow,searchEvidence} from './demand';
import {readGeoGrowthEvidence,persistGeoDemand} from './evidence-repository';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
const strong=[7,14,28].map(days=>({...emptyWindow(days as 7|14|28),sessions:100,observedDays:7,fixtures:4,views:100,markets:100,selections:100,slipAdds:100,comparisons:100,bookmakerInteractions:100,outbound:100}));
describe('GEO bettor demand evidence',()=>{
  it('requires real sufficient observations and does not manufacture trend data',()=>{
    const e=bettingEvidence('MX',[emptyWindow(7),emptyWindow(14),emptyWindow(28)]);
    expect(e).toMatchObject({sufficient:false,strength:0});expect(demandProfile('liga-mx',1,0,e).adjustment).toBe(0);
  });
  it('smooths 7/14/28 session action rates and bounds absolute weekly changes',()=>{
    const e=bettingEvidence('CO',strong),p=demandProfile('colombia-primera-a',1,0,e);
    expect(e.strength).toBeLessThan(1);expect(e.strength).toBeGreaterThan(.6);expect(p.adjustment).toBe(.03);
    expect(demandProfile('colombia-primera-a',1,.12,e).adjustment).toBeLessThanOrEqual(.12);
    expect(demandProfile('colombia-primera-a',1,.12,e).effective).toBeLessThanOrEqual(1);
  });
  it('does not let a single viral match rewrite competition demand',()=>{
    const e=bettingEvidence('PE',strong.map(w=>({...w,fixtures:1})));
    expect(demandProfile('peru-liga-1',1,0,e).adjustment).toBe(0);
    expect(demandProfile('peru-liga-1',1,.12,e).adjustment).toBe(.09);
  });
  it('keeps sparse GSC zero and explicitly labels URL locale rather than visitor country',()=>{
    expect(searchEvidence({clicks:0,impressions:49,position:8,days:7})).toMatchObject({strength:0,status:'insufficient data'});
    expect(searchEvidence({clicks:5,impressions:500,position:8,days:28})).toMatchObject({status:'striking distance',dimension:'canonical locale path (not visitor country)'});
  });
  it('queries one exact GEO, HUMAN events and matching HUMAN identities over bounded windows',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));
    const result=await readGeoGrowthEvidence({query} as unknown as QueryExecutor,'PE',['https://livasports.com/pe/partido/test'],new Date('2026-10-03T12:00:00Z'));
    const calls=query.mock.calls as unknown as Array<[string,unknown[]]>;
    expect(calls[0][0]).toContain("e.geo=$1 AND s.traffic_class='HUMAN' AND e.traffic_class='HUMAN'");
    expect(calls[0][0]).toContain('s.anonymous_id=e.anonymous_id');expect(calls[0][0]).toContain('FROM fixtures WHERE id=e.fixture_id');
    expect(calls[0][0]).toContain("key ~ '^fixture[0-9]$'");
    expect(calls[0][0]).toContain('VALUES(7),(14),(28)');expect(calls[0][1][0]).toBe('PE');
    expect(calls[2][0]).toContain('key=ANY($2::text[])');expect(result.fixtures.size).toBe(0);
  });
  it('does not compound or write a second weekly weight during repeated scheduled runs',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT adjustment')?[{adjustment:.03,evaluated_week:'2026-09-28'}]:[],rowCount:0}));
    const db={query,transaction:async(fn:(tx:QueryExecutor)=>unknown)=>fn({query} as unknown as QueryExecutor)} as unknown as DatabaseClient;
    await persistGeoDemand(db,'MX',[demandProfile('liga-mx',1,.03,bettingEvidence('MX',strong))],new Date('2026-10-03T12:00:00Z'));
    expect(query.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
  });
});
