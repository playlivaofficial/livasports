import {describe,it,expect,vi} from 'vitest';
import {summarizeFourSources,readFourSourceHealth} from './four-source-health';
import type {ReadOddsQuote,OddsReadSnapshot} from './types';
const now=Date.parse('2026-09-21T08:00:00Z');
const quote=(bookmaker:string,decimalOdds='2.1'):ReadOddsQuote=>({bookmaker,bookmakerName:bookmaker,bookmakerId:bookmaker,quoteId:bookmaker,fixtureId:'f',providerFixtureId:'p',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds,status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:new Date(now+3600000).toISOString(),sourceDomain:'test.invalid',geoEligible:true});
const snapshot=(quotes:ReadOddsQuote[]):OddsReadSnapshot=>({quotes,kickoff:new Date(now+3600000).toISOString(),fixtureStatus:'SCHEDULED'});
describe('four-source health contract',()=>{
  it('counts visible source overlap without treating hidden coverage as three REAL books',()=>{
    const h=summarizeFourSources([snapshot([quote('betsson'),quote('sportingbet.bet.br'),quote('1xbet'),quote('betano.bet.br')])],now);
    expect(h.visibleReal.three).toBe(1);expect(h.sources.map(s=>s.currentFixtures)).toEqual([1,1,1,1]);
    expect(h.targets.every(t=>t.real===1&&t.proxy===0&&t.unavailable===6)).toBe(true);
  });
  it('counts failed preferred insurance and lowest alternate independently of own REAL',()=>{
    const h=summarizeFourSources([snapshot([quote('sportingbet.bet.br','2.2'),quote('1xbet','2.0')])],now);
    expect(h.targets[0]).toMatchObject({real:0,proxy:1,ALTERNATE_INSURANCE_USED:1,BETANO_INSURANCE_FAILED:7,NO_INSURANCE_AVAILABLE:6});
    expect(h.visibleReal.two).toBe(1);
  });
  it('never calls provider, returns empty windows honestly and uses one query for no fixtures',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});const fetch=vi.spyOn(globalThis,'fetch');
    const result=await readFourSourceHealth({query},new Date(now));
    expect(result.providerRequests).toBe(0);expect(result.windows['7d'].fixtures).toBe(0);expect(query).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
});
