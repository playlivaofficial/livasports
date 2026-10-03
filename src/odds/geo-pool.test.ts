import {describe,expect,it} from 'vitest';
import {buildComparison} from './comparison';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {buildSlipComparison} from '@/slip/comparison';
import {formatMoney,multiplyDecimalOdds} from '@/slip/decimal';
describe('explicit jurisdiction bookmaker pools',()=>{
  it('does not resurrect BR cards from insurance when the server pool is empty',()=>{
    const f=comparisonFixture();const snapshot=[...f.data.fixtures.values()][0].snapshot;
    expect(buildComparison({...snapshot,eligibleBookmakers:[]},'MATCH_WINNER',f.now).rows).toEqual([]);
  });
  it('only emits the explicitly allowed target even when other source quotes exist',()=>{
    const f=comparisonFixture();const snapshot=[...f.data.fixtures.values()][0].snapshot;
    const rows=buildComparison({...snapshot,eligibleBookmakers:[{id:'betsson',name:'Betsson',priority:1}]},'MATCH_WINNER',f.now).rows;
    expect(rows.map(r=>r.bookmaker)).toEqual(['betsson']);
  });
  it('preserves exactly the canonical selections when eligible pools differ',()=>{
    const f=comparisonFixture(3);const mx=f.data.bookmakers.slice(0,1).map(b=>({...b,geoEligibility:{eligible:true,locale:'mx' as const}}));
    const co=f.data.bookmakers.slice(1).map(b=>({...b,geoEligibility:{eligible:true,locale:'co' as const}}));
    const a=buildSlipComparison(f.selections,'mx',f.data.fixtures,mx,f.now),b=buildSlipComparison(f.selections,'co',f.data.fixtures,co,f.now);
    expect(a.bookmakers.map(x=>x.bookmakerId)).not.toEqual(b.bookmakers.map(x=>x.bookmakerId));
    for(const result of [a,b])for(const book of result.bookmakers)expect(book.selectionQuotes.map(q=>q.selection)).toEqual(f.selections);
  });
  it('never turns a missing core-GEO leg into a complete price using another operator',()=>{
    const f=comparisonFixture(3);const first=f.data.fixtures.get(f.selections[0].fixturePublicId)!;
    first.snapshot.quotes=first.snapshot.quotes.filter(q=>q.bookmaker!=='betsson');
    const configs=f.data.bookmakers.map(b=>({...b,insuranceEnabled:false,geoEligibility:{eligible:true,locale:'co' as const}}));
    const book=buildSlipComparison(f.selections,'co',f.data.fixtures,configs,f.now).bookmakers.find(b=>b.bookmakerId==='betsson')!;
    expect(book.complete).toBe(false);expect(book.combinedDecimalOdds).toBeNull();expect(book.ctaState).toBe('INCOMPLETE');
    expect(buildComparison({...first.snapshot,insuranceEnabled:false,eligibleBookmakers:[{id:'betsson',name:'Betsson',priority:1},{id:'sportingbet.bet.br',name:'Synthetic comparison source',priority:2}]},'MATCH_WINNER',f.now).rows.find(b=>b.bookmaker==='betsson')?.cells.every(c=>c.decimalOdds===null)).toBe(true);
  });
  it('uses correct money labels without converting decimal odds',()=>{
    expect(formatMoney('10','mx')).toContain('MX$');expect(formatMoney('10','co')).toContain('COP$');expect(formatMoney('10','pe')).toContain('S/');expect(formatMoney('10','en')).not.toContain('R$');
    expect(multiplyDecimalOdds(['2.10','3.20'])).toBe('6.72');
  });
});
