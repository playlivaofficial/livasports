import {describe,it,expect} from 'vitest';
import {safeAffiliateDestination,validOutboundRequest} from './affiliate';
describe('affiliate boundary',()=>{
  it('only allows configured HTTPS destinations for exact verified jurisdiction hosts',()=>{
    expect(safeAffiliateDestination('betano.bet.br','br','https://www.betano.bet.br/?partner=approved')).not.toBeNull();
    expect(safeAffiliateDestination('betsson','br','https://betsson.bet.br/')).not.toBeNull();
  });
  it.each(['https://betsson.com/','https://evil.test','http://betsson.bet.br/','https://user:pass@betsson.bet.br/','https://betsson.bet.br.evil.test/','javascript:alert(1)','https://betsson.bet.br:8080/','//betsson.bet.br/'])('rejects unsafe/unverified %s',url=>{
    expect(safeAffiliateDestination('betsson','br',url)).toBeNull();
  });
  it('never invents an affiliate link or treats Brazilian access as Mexican coverage',()=>{
    expect(safeAffiliateDestination('betsson','br',null)).toBeNull();
    expect(safeAffiliateDestination('betano.bet.br','mx','https://betano.bet.br/')).toBeNull();
    expect(safeAffiliateDestination('betsson','mx','https://betsson.com/')).toBeNull();
  });
  it('requires the one approved placement and rejects duplicate or arbitrary destination parameters',()=>{
    const base='fixtureId=efb9eb42-36e5-4aa8-9b0d-05cbe62b9dd3&locale=br&market=MATCH_WINNER&placement=match-odds';
    expect(validOutboundRequest('betsson',new URLSearchParams(base))).toBe(true);
    for(const suffix of ['&url=https://evil.test','&destination=evil','&locale=mx','&placement=other'])expect(validOutboundRequest('betsson',new URLSearchParams(base+suffix))).toBe(false);
    expect(validOutboundRequest('betsson',new URLSearchParams(base.replace('placement=match-odds','placement=banner')))).toBe(false);
  });
});
