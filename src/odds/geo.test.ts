import {describe,it,expect} from 'vitest';
import {eligibleSource,verifiedGeo} from './geo';
describe('documented pricing GEO boundary',()=>{
  it('generic Betsson stays gated despite approval or an erroneous verified flag',()=>{
    for(const state of ['VERIFIED_BR','VERIFIED_BR_MX','GENERIC_UNVERIFIED'])expect(eligibleSource('betsson','br',state,'www.betsson.com')).toBe(false);
  });
  it('requires both jurisdiction evidence and the corresponding source domain',()=>{
    expect(eligibleSource('betsson','br','VERIFIED_BR','www.betsson.bet.br')).toBe(true);
    expect(eligibleSource('betsson','mx','VERIFIED_BR','www.betsson.bet.br')).toBe(false);
    expect(eligibleSource('betsson','mx','VERIFIED_MX','www.betsson.mx')).toBe(true);
    expect(eligibleSource('betsson','mx','GENERIC_UNVERIFIED','www.betsson.mx')).toBe(false);
    expect(verifiedGeo('ACTIVE','br')).toBe(false);
  });
  it('can never turn Betano BR into a Mexican feed',()=>{
    expect(eligibleSource('betano.bet.br','br','VERIFIED_BR','www.betano.bet.br')).toBe(true);
    expect(eligibleSource('betano.bet.br','mx','VERIFIED_BR_MX','www.betano.bet.br')).toBe(false);
  });
});
