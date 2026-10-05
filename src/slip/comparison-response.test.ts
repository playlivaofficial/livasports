import {it,expect} from 'vitest';
import {comparisonFixture,PUBLIC_CARD_IDS,withPublicCards} from './comparison-fixtures.test-support';
import {buildSlipComparison} from './comparison';
import {validComparisonResponse} from './comparison-response';
it('accepts every configured public card and rejects hidden, duplicate and unexpected targets',()=>{
  const f=withPublicCards(comparisonFixture(3));
  const c=buildSlipComparison(f.selections,'co',f.data.fixtures,f.data.bookmakers,f.now);
  const last=PUBLIC_CARD_IDS.length-1;
  expect(c.bookmakers).toHaveLength(PUBLIC_CARD_IDS.length);expect(validComparisonResponse(c,'co',f.selections)).toBe(true);
  // A retired operator, a duplicate of the first card and an unknown slug are all refused.
  for(const id of ['betano.bet.br',PUBLIC_CARD_IDS[0],'unknown']){const invalid=structuredClone(c);invalid.bookmakers[last].bookmakerId=id;expect(validComparisonResponse(invalid,'co',f.selections)).toBe(false);}
  expect(validComparisonResponse(c,'mx',f.selections)).toBe(false);
});
