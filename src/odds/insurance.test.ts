import {describe,it,expect} from 'vitest';
import {resolveInsurance,type InsuranceCandidate} from './insurance';
const candidate=(bookmaker:string,decimalOdds='2.10',overrides:Partial<InsuranceCandidate<string>>={}):InsuranceCandidate<string>=>({bookmaker,decimalOdds,current:true,priceKind:'REAL',value:bookmaker,...overrides});
describe('P5 exact-selection native insurance resolver',()=>{
  it('own REAL wins immediately, including after recovery',()=>{
    const sources=[candidate('betano.bet.br'),candidate('betboo.bet.br','1.9')];
    expect(resolveInsurance('betsson',sources).candidate?.bookmaker).toBe('betano.bet.br');
    expect(resolveInsurance('betsson',[...sources,candidate('betsson','2.22')]).resolution).toBe('OWN_REAL');
  });
  it('preferred insurance wins ahead of a lower alternate',()=>expect(resolveInsurance('betsson',[candidate('betano.bet.br'),candidate('betboo.bet.br','2.05')]).candidate?.bookmaker).toBe('betano.bet.br'));
  it('selects the lowest healthy visible alternate',()=>expect(resolveInsurance('betsson',[candidate('sportingbet.bet.br','2.18'),candidate('betboo.bet.br','2.05')]).candidate?.bookmaker).toBe('betboo.bet.br'));
  it('accepts one real alternate',()=>expect(resolveInsurance('betsson',[candidate('betboo.bet.br')]).resolution).toBe('ALTERNATE_INSURANCE_USED'));
  it('fails closed when all sources are missing',()=>expect(resolveInsurance('betsson',[]).resolution).toBe('NO_INSURANCE_AVAILABLE'));
  it('never chains proxies or consumes expired/invalid quotes',()=>expect(resolveInsurance('betsson',[candidate('betano.bet.br','2',{current:false}),candidate('betboo.bet.br','2',{priceKind:'PROXY'}),candidate('sportingbet.bet.br','NaN')]).candidate).toBeNull());
  it('uses deterministic configured priority on equal decimals',()=>expect(resolveInsurance('betsson',[candidate('betboo.bet.br','2.100'),candidate('sportingbet.bet.br','2.1')]).candidate?.bookmaker).toBe('sportingbet.bet.br'));
  it('uses an alternate when preferred insurance is stale',()=>{
    const result=resolveInsurance('betsson',[candidate('betano.bet.br','2',{current:false}),candidate('betboo.bet.br')]);
    expect(result.resolution).toBe('ALTERNATE_INSURANCE_USED');expect(result.preferredInsuranceFailed).toBe(true);
  });
  it('rejects unknown sources even with a valid price',()=>expect(resolveInsurance('betsson',[candidate('unknown')]).candidate).toBeNull());
});
