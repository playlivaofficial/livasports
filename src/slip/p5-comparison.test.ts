import {describe,it,expect} from 'vitest';
import {comparisonFixture,PUBLIC_CARD_IDS,withPublicCards} from './comparison-fixtures.test-support';
import {buildSlipComparison,guardSlipComparison} from './comparison';
import {multiplyDecimalOdds,potentialReturn} from './decimal';

/**
 * Colombia's public-card slip matrix. Brazil's hidden insurance book (Betano) was retired with the
 * MX/CO/PE cutover, so there is no longer a non-public source to borrow from: every price a card can
 * show comes either from itself or from the other public card, and both are disclosed. Colombia is
 * used because it is the only jurisdiction with two books — Mexico and Peru are single-book, which
 * `comparison.test.ts` covers.
 */
const TARGET=PUBLIC_CARD_IDS[0],ALTERNATE=PUBLIC_CARD_IDS[1];
// Ascending prices, so "lowest eligible" is the earliest surviving source in this order.
const PRICE=Object.fromEntries(PUBLIC_CARD_IDS.map((bookmaker,i)=>[bookmaker,String(i+2)]));
const bookmakerOf=(price:string)=>PUBLIC_CARD_IDS.find(b=>PRICE[b]===price)!;

describe('public-card slip / native source matrix',()=>{
  it('uses exactly the jurisdiction line-up, with no retired or out-of-GEO book',()=>{
    expect(PUBLIC_CARD_IDS).toEqual(['betsson','bwin']);
  });

  for(const count of [1,2,3,5,10])for(const mode of ['real','alternate','mixed','incomplete'] as const)it(`${count} legs / ${mode}`,()=>{
    const f=withPublicCards(comparisonFixture(count));
    for(const [index,read] of [...f.data.fixtures.values()].entries()){
      const base=read.snapshot.quotes[0];
      read.snapshot.quotes=PUBLIC_CARD_IDS.map(bookmaker=>({...base,bookmaker,bookmakerName:bookmaker,quoteId:`${index}-${bookmaker}`,decimalOdds:PRICE[bookmaker]}));
      const branch=mode==='mixed'?(index%2===0?'real':'alternate'):mode;
      // 'alternate' drops the target's own price, so its card must borrow from the other public card.
      if(branch==='alternate')read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker!==TARGET);
      if(mode==='incomplete'&&index===count-1)read.snapshot.quotes=[];
    }
    const before=JSON.stringify([...f.data.fixtures.values()]);
    const result=buildSlipComparison(f.selections,'co',f.data.fixtures,f.data.bookmakers,f.now);
    expect(result.bookmakers.map(b=>b.bookmakerId)).toEqual(PUBLIC_CARD_IDS);
    const target=result.bookmakers[0];
    if(mode==='incomplete'){
      expect(result.bookmakers.every(b=>b.priceClassification==='INCOMPLETE'&&b.combinedDecimalOdds===null&&b.ctaState==='INCOMPLETE')).toBe(true);
    }else{
      const expected=f.selections.map((_,i)=>mode==='alternate'?PRICE[ALTERNATE]
        :mode==='mixed'?[PRICE[TARGET],PRICE[ALTERNATE]][i%2]:PRICE[TARGET]);
      expect(target.combinedDecimalOdds).toBe(multiplyDecimalOdds(expected));
      expect(potentialReturn('10',target.combinedDecimalOdds!)).toBe(potentialReturn('10',multiplyDecimalOdds(expected)!));
      expect(target.priceClassification).toBe(expected.every(p=>p===PRICE[TARGET])?'REAL_COMPLETE':'ESTIMATED_COMPLETE');
      // Provenance is always disclosed per leg, so a borrowed price can never read as the card's own.
      target.selectionQuotes.forEach((q,i)=>{expect(q.sourceBookmakerId).toBe(bookmakerOf(expected[i]));expect(q.sourceQuoteId).toBe(`${i}-${q.sourceBookmakerId}`);});
      expect(target.ctaState).toBe('ENABLED');
      // bwin has no approved campaign — Entain access does not exist yet — so its CTA stays closed.
      expect(result.bookmakers.slice(1).every(b=>b.ctaState==='AFFILIATE_UNAVAILABLE')).toBe(true);
      expect(guardSlipComparison(result,count,f.now+3600000).bookmakers.every(b=>b.combinedDecimalOdds===null)).toBe(true);
    }
    expect(JSON.stringify([...f.data.fixtures.values()])).toBe(before);
  });
});
