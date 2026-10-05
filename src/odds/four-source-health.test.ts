import {describe,it,expect,vi} from 'vitest';
import {summarizeFourSources,mergeSourceHealth,eligibleOperatorsFor,readFourSourceHealth} from './four-source-health';
import {ACTIVE_BOOKMAKER_IDS} from './registry';
import type {ReadOddsQuote,OddsReadSnapshot} from './types';
const now=Date.parse('2026-09-21T08:00:00Z');
const quote=(bookmaker:string,decimalOdds='2.1'):ReadOddsQuote=>({bookmaker,bookmakerName:bookmaker,bookmakerId:bookmaker,quoteId:bookmaker,fixtureId:'f',providerFixtureId:'p',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds,status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:new Date(now+3600000).toISOString(),sourceDomain:'test.invalid',geoEligible:true});

const MX=eligibleOperatorsFor('MX'),CO=eligibleOperatorsFor('CO'),PE=eligibleOperatorsFor('PE');
const pool=(ids:readonly string[])=>ids.map((id,i)=>({id,name:id,priority:(i+1)*10}));
const snapshot=(quotes:ReadOddsQuote[],eligible:readonly string[]=CO,insuranceEnabled=false):OddsReadSnapshot=>
  ({quotes,kickoff:new Date(now+3600000).toISOString(),fixtureStatus:'SCHEDULED',eligibleBookmakers:pool(eligible),insuranceEnabled});
const many=(n:number,quotes:(i:number)=>ReadOddsQuote[],eligible:readonly string[])=>
  Array.from({length:n},(_,i)=>snapshot(quotes(i),eligible));
const source=(h:ReturnType<typeof summarizeFourSources>,id:string)=>h.sources.find(s=>s.bookmaker===id)!;

describe('per-jurisdiction source eligibility', ()=>{
  it('derives each jurisdiction line-up from the registry',()=>{
    expect(MX).toEqual(['betsson']);
    expect(CO).toEqual(['betsson','bwin']);
    expect(PE).toEqual(['inkabet']);
  });
});

describe('jurisdiction health is evaluated in isolation',()=>{
  it('does not penalise Inkabet for zero Colombia coverage',()=>{
    const health=summarizeFourSources(many(10,()=>[quote('betsson'),quote('bwin')],CO),now,CO);
    expect(health.degraded).toBe(false);
    // Inkabet is not part of the Colombian baseline at all.
    expect(source(health,'inkabet').eligibleFixtures).toBe(0);
    expect(source(health,'inkabet').currentFixtures).toBe(0);
  });

  it('does not penalise bwin for zero Mexico or Peru coverage',()=>{
    for(const [eligible,priced] of [[MX,'betsson'],[PE,'inkabet']] as const){
      const health=summarizeFourSources(many(10,()=>[quote(priced)],eligible),now,eligible);
      expect(health.degraded).toBe(false);
      expect(source(health,'bwin').eligibleFixtures).toBe(0);
    }
  });

  it('evaluates Mexico against Betsson alone',()=>{
    const healthy=summarizeFourSources(many(10,()=>[quote('betsson')],MX),now,MX);
    expect(source(healthy,'betsson').eligibleFixtures).toBe(10);
    expect(source(healthy,'betsson').currentFixtures).toBe(10);
    expect(healthy.degraded).toBe(false);
    // A single-book jurisdiction is still measured against its own expected fixtures.
    const collapsed=summarizeFourSources(many(10,()=>[],MX),now,MX);
    expect(source(collapsed,'betsson').eligibleFixtures).toBe(10);
    expect(collapsed.degraded).toBe(true);
  });

  it('evaluates Peru against Inkabet alone',()=>{
    expect(summarizeFourSources(many(10,()=>[quote('inkabet')],PE),now,PE).degraded).toBe(false);
    expect(summarizeFourSources(many(10,()=>[],PE),now,PE).degraded).toBe(true);
  });

  it('compares Betsson and bwin within Colombia only',()=>{
    const health=summarizeFourSources(many(10,()=>[quote('betsson'),quote('bwin')],CO),now,CO);
    expect(health.visibleReal.two).toBe(10);
    expect(health.visibleReal.three).toBe(0);
    // bwin going dark in Colombia is a Colombian degradation, even while Betsson is healthy.
    const half=summarizeFourSources(many(10,()=>[quote('betsson')],CO),now,CO);
    expect(source(half,'bwin').eligibleFixtures).toBe(10);
    expect(source(half,'bwin').currentFixtures).toBe(0);
    expect(half.degraded).toBe(true);
  });

  it('never lets a retired book participate in any baseline',()=>{
    const health=summarizeFourSources(many(6,()=>[quote('betsson'),quote('1xbet'),quote('sportingbet.bet.br'),quote('betano.bet.br')],MX),now,MX);
    for(const retired of ['1xbet','sportingbet.bet.br','betano.bet.br','betboo.bet.br'])
      expect(health.sources.some(s=>s.bookmaker===retired)).toBe(false);
    expect(health.sources.map(s=>s.bookmaker)).toEqual([...ACTIVE_BOOKMAKER_IDS]);
    // A retired book pricing everything cannot make the jurisdiction look healthy either.
    expect(summarizeFourSources(many(6,()=>[quote('1xbet')],MX),now,MX).degraded).toBe(true);
  });
});

describe('merged owner view does not let jurisdictions contaminate each other',()=>{
  const healthyCo={geo:'CO' as const,summary:summarizeFourSources(many(10,()=>[quote('betsson'),quote('bwin')],CO),now,CO)};
  const healthyPe={geo:'PE' as const,summary:summarizeFourSources(many(10,()=>[quote('inkabet')],PE),now,PE)};
  const brokenMx={geo:'MX' as const,summary:summarizeFourSources(many(10,()=>[],MX),now,MX)};
  const healthyMx={geo:'MX' as const,summary:summarizeFourSources(many(10,()=>[quote('betsson')],MX),now,MX)};

  it('reports healthy when every jurisdiction is healthy',()=>{
    const merged=mergeSourceHealth([healthyMx,healthyCo,healthyPe],10);
    expect(merged.degraded).toBe(false);
    expect(merged.geos.map(g=>g.geo)).toEqual(['MX','CO','PE']);
    expect(merged.geos.every(g=>!g.degraded)).toBe(true);
  });

  it('surfaces a Mexican outage even though Betsson is healthy in Colombia',()=>{
    // This is the masking case: Betsson serves MX and CO, so a global denominator would hide it.
    const merged=mergeSourceHealth([brokenMx,healthyCo,healthyPe],10);
    expect(merged.degraded).toBe(true);
    expect(merged.geos.find(g=>g.geo==='MX')!.degraded).toBe(true);
    expect(merged.geos.find(g=>g.geo==='CO')!.degraded).toBe(false);
    expect(merged.geos.find(g=>g.geo==='PE')!.degraded).toBe(false);
  });

  it('counts distinct fixtures rather than one per jurisdiction evaluation',()=>{
    const merged=mergeSourceHealth([healthyMx,healthyCo,healthyPe],10);
    expect(merged.fixtures).toBe(10);
    // Betsson is eligible in both MX and CO, so its baseline spans both.
    expect(source(merged,'betsson').eligibleFixtures).toBe(20);
    expect(source(merged,'inkabet').eligibleFixtures).toBe(10);
  });
});

describe('source health read path',()=>{
  it('never calls provider, returns empty windows honestly and uses one query for no fixtures',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});const fetch=vi.spyOn(globalThis,'fetch');
    const result=await readFourSourceHealth({query},new Date(now));
    expect(result.providerRequests).toBe(0);
    expect(result.windows['7d'].fixtures).toBe(0);
    expect(result.windows['7d'].degraded).toBe(false);
    // No fixtures means no eligibility read and no per-GEO odds reads either.
    expect(query).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });

  it('takes the eligible line-up from verified provider mappings, not from observed pricing',async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('FROM fixtures'))return {rows:[{id:'11111111-1111-4111-8111-111111111111',kickoff:new Date(now+3600000).toISOString()}]};
      if(sql.includes('operator_provider_mappings'))return {rows:[
        {geo:'MX',operator_id:'betsson',provider_bookmaker_id:'betsson',source_domains:['www.betsson.com']},
        {geo:'CO',operator_id:'betsson',provider_bookmaker_id:'betsson',source_domains:['www.betsson.com']},
        {geo:'CO',operator_id:'bwin',provider_bookmaker_id:'bwin',source_domains:['sports.bwin.com']},
        {geo:'PE',operator_id:'inkabet',provider_bookmaker_id:'inkabet',source_domains:['www.betsson.com']},
      ]};
      return {rows:[]};
    });
    const result=await readFourSourceHealth({query:query as never},new Date(now));
    const geos=result.windows['7d'].geos;
    expect(geos.find(g=>g.geo==='MX')!.eligible).toEqual(['betsson']);
    expect(geos.find(g=>g.geo==='CO')!.eligible).toEqual(['betsson','bwin']);
    expect(geos.find(g=>g.geo==='PE')!.eligible).toEqual(['inkabet']);
  });

  it('counts an unpriced fixture as missing coverage rather than dropping it from the universe',async()=>{
    // The odds read returns nothing at all, which previously made the baseline vanish and read healthy.
    const query=vi.fn(async(sql:string)=>sql.includes('FROM fixtures')
      ?{rows:[1,2,3,4,5,6].map(i=>({id:`1111111${i}-1111-4111-8111-111111111111`,kickoff:new Date(now+3600000).toISOString()}))}
      :{rows:[]});
    const result=await readFourSourceHealth({query:query as never},new Date(now));
    expect(result.windows['7d'].fixtures).toBe(6);
    expect(result.windows['7d'].degraded).toBe(true);
    expect(result.windows['7d'].geos.every(g=>g.degraded)).toBe(true);
    expect(source(result.windows['7d'],'betsson').eligibleFixtures).toBe(12);
    expect(source(result.windows['7d'],'betsson').currentFixtures).toBe(0);
  });
});
