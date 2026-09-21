import {it,expect} from 'vitest';
import {comparisonFixture} from './comparison-fixtures.test-support';
import {buildSlipComparison} from './comparison';
import {validComparisonResponse} from './comparison-response';
it('accepts all three configured public cards and rejects hidden, duplicate and unexpected targets',()=>{
  const f=comparisonFixture(3);f.data.bookmakers.push({...f.data.bookmakers[1],bookmakerId:'betboo.bet.br',displayName:'betboo BR'});
  const c=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
  expect(c.bookmakers).toHaveLength(3);expect(validComparisonResponse(c,'br',f.selections)).toBe(true);
  for(const id of ['betano.bet.br','betsson','unknown']){const invalid=structuredClone(c);invalid.bookmakers[2].bookmakerId=id;expect(validComparisonResponse(invalid,'br',f.selections)).toBe(false);}
  expect(validComparisonResponse(c,'mx',f.selections)).toBe(false);
});
