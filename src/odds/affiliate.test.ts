import {describe,it,expect} from 'vitest';
import {safeAffiliateDestination} from './affiliate';
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
});
