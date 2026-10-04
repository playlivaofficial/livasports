import {describe,it,expect} from 'vitest';
import {eligibleSource,verifiedGeo} from './geo';
describe('documented pricing GEO boundary',()=>{
  it('accepts owner-confirmed Betsson BR even with generic feed naming, but still requires GEO verification',()=>{
    for(const state of ['VERIFIED_BR','VERIFIED_BR_MX'])expect(eligibleSource('betsson','BR',state,'www.betsson.com')).toBe(true);
    for(const state of ['GENERIC_UNVERIFIED','VERIFIED_MX','NOT_ELIGIBLE'])expect(eligibleSource('betsson','BR',state,'www.betsson.com')).toBe(false);
    expect(eligibleSource('betsson','MX','VERIFIED_MX','www.betsson.com')).toBe(false);
    expect(eligibleSource('betsson',null,'VERIFIED_BR','www.betsson.com')).toBe(false);
  });
  it('requires both jurisdiction evidence and the corresponding source domain',()=>{
    expect(eligibleSource('betsson','BR','VERIFIED_BR','www.betsson.bet.br')).toBe(true);
    expect(eligibleSource('betsson','MX','VERIFIED_BR','www.betsson.bet.br')).toBe(false);
    expect(eligibleSource('betsson','MX','VERIFIED_MX','www.betsson.mx')).toBe(true);
    expect(eligibleSource('betsson','MX','GENERIC_UNVERIFIED','www.betsson.mx')).toBe(false);
    expect(verifiedGeo('ACTIVE','BR')).toBe(false);
  });
  it('can never turn Betano BR into a Mexican feed',()=>{
    expect(eligibleSource('betano.bet.br','BR','VERIFIED_BR','www.betano.bet.br')).toBe(true);
    expect(eligibleSource('betano.bet.br','MX','VERIFIED_BR_MX','www.betano.bet.br')).toBe(false);
  });
  it.each(['MX','CO','PE'] as const)('does not let a configured domain override the BR-only feed boundary for %s',geo=>{
    for(const operator of ['betano.bet.br','sportingbet.bet.br','betboo.bet.br']){
      expect(eligibleSource(operator,geo,`VERIFIED_${geo}`,operator,[operator])).toBe(false);
      expect(eligibleSource(operator,geo,`VERIFIED_${geo}`,`operator.${geo.toLowerCase()}`,[`operator.${geo.toLowerCase()}`])).toBe(false);
    }
  });
  it('preserves BR historical eligibility and separate verified generic Betano country feeds',()=>{
    expect(eligibleSource('betano.bet.br','BR','VERIFIED_BR','betano.bet.br',['betano.bet.br'])).toBe(true);
    expect(eligibleSource('betano','CO','VERIFIED_CO','betano.co',['betano.co'])).toBe(true);
    expect(eligibleSource('betano','PE','VERIFIED_PE','betano.pe',['betano.pe'])).toBe(true);
  });
});
