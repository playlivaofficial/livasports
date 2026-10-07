import {describe,it,expect} from 'vitest';
import {comparisonFixture,PUBLIC_CARD_IDS,withPublicCards} from './comparison-fixtures.test-support';
import {buildSlipComparison,guardSlipComparison} from './comparison';
import {multiplyDecimalOdds,potentialReturn} from './decimal';

/**
 * Colombia's public-card slip matrix. Brazil's hidden insurance book (Betano) was retired with the
 * MX/CO/PE cutover, and a public card never borrows from another public card, so every price a card
 * shows is its own. A card that did not price every leg has no accumulator at all. Colombia is used
 * because it is the only jurisdiction with two books — Mexico and Peru are single-book, which
 * `comparison.test.ts` covers.
 */
const TARGET=PUBLIC_CARD_IDS[0],ALTERNATE=PUBLIC_CARD_IDS[1];
// Distinct ascending prices, so each card's own total is unmistakably its own.
const PRICE=Object.fromEntries(PUBLIC_CARD_IDS.map((bookmaker,i)=>[bookmaker,String(i+2)]));

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
      // 'alternate' drops the target's own price. Its card must then be unavailable, not borrowed.
      if(branch==='alternate')read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker!==TARGET);
      if(mode==='incomplete'&&index===count-1)read.snapshot.quotes=[];
    }
    const before=JSON.stringify([...f.data.fixtures.values()]);
    const result=buildSlipComparison(f.selections,'co',f.data.fixtures,f.data.bookmakers,f.now);
    expect(result.bookmakers.map(b=>b.bookmakerId)).toEqual(PUBLIC_CARD_IDS);
    const target=result.bookmakers[0];
    const alternate=result.bookmakers[1];
    // Which legs the target lost: all of them under 'alternate', the odd ones under 'mixed'. With a
    // single leg 'mixed' drops nothing, so it behaves exactly like 'real'.
    const targetLostALeg=f.selections.some((_,i)=>mode==='alternate'||(mode==='mixed'&&i%2!==0));
    if(mode==='incomplete'){
      expect(result.bookmakers.every(b=>b.priceClassification==='INCOMPLETE'&&b.combinedDecimalOdds===null&&b.ctaState==='INCOMPLETE')).toBe(true);
    }else if(!targetLostALeg){
      // Both cards priced every leg themselves, so both are real and complete.
      expect(target.combinedDecimalOdds).toBe(multiplyDecimalOdds(f.selections.map(()=>PRICE[TARGET])));
      expect(potentialReturn('10',target.combinedDecimalOdds!)).toBe(potentialReturn('10',multiplyDecimalOdds(f.selections.map(()=>PRICE[TARGET]))!));
      expect(target.priceClassification).toBe('REAL_COMPLETE');
      target.selectionQuotes.forEach((q,i)=>{expect(q.sourceBookmakerId).toBe(TARGET);expect(q.sourceQuoteId).toBe(`${i}-${TARGET}`);});
      expect(target.ctaState).toBe('ENABLED');
      expect(alternate.priceClassification).toBe('REAL_COMPLETE');
      // bwin has no approved campaign — Entain access does not exist yet — so its CTA stays closed.
      expect(result.bookmakers.slice(1).every(b=>b.ctaState==='AFFILIATE_UNAVAILABLE')).toBe(true);
      expect(guardSlipComparison(result,count,f.now+3600000).bookmakers.every(b=>b.combinedDecimalOdds===null)).toBe(true);
    }else{
      // 'alternate' removed the target's price on every leg, 'mixed' on half of them. Either way the
      // target priced fewer than all legs, so it has no accumulator and no CTA — it is never completed
      // from the other card's prices.
      expect(target.priceClassification).toBe('INCOMPLETE');
      expect(target.combinedDecimalOdds).toBeNull();
      expect(target.ctaState).toBe('INCOMPLETE');
      expect(target.proxySelectionCount).toBe(0);
      // Every leg it did price is its own, and the alternate is unaffected and complete on its own.
      for(const q of target.selectionQuotes.filter(q=>q.decimalOdds!==null))expect(q.sourceBookmakerId).toBe(TARGET);
      expect(alternate.priceClassification).toBe('REAL_COMPLETE');
      expect(alternate.combinedDecimalOdds).toBe(multiplyDecimalOdds(f.selections.map(()=>PRICE[ALTERNATE])));
      alternate.selectionQuotes.forEach((q,i)=>{expect(q.sourceBookmakerId).toBe(ALTERNATE);expect(q.sourceQuoteId).toBe(`${i}-${ALTERNATE}`);});
      expect(alternate.ctaState).toBe('AFFILIATE_UNAVAILABLE');
      expect(guardSlipComparison(result,count,f.now+3600000).bookmakers.every(b=>b.combinedDecimalOdds===null)).toBe(true);
    }
    expect(JSON.stringify([...f.data.fixtures.values()])).toBe(before);
  });
});
