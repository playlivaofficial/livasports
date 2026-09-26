import {describe,it,expect} from 'vitest';
import {comparisonFixture,PUBLIC_CARD_IDS,withPublicCards} from './comparison-fixtures.test-support';
import {buildSlipComparison,guardSlipComparison} from './comparison';
import {multiplyDecimalOdds,potentialReturn} from './decimal';

const BETANO='betano.bet.br';
// Every native source the Brazil pipeline reads: the public cards plus the hidden insurance book.
const SOURCES=[...PUBLIC_CARD_IDS,BETANO];
// Ascending prices, so "lowest eligible" is the earliest surviving source in this order.
const PRICE=Object.fromEntries(SOURCES.map((bookmaker,i)=>[bookmaker,String(i+2)]));
const TARGET=PUBLIC_CARD_IDS[0],ALTERNATE=PUBLIC_CARD_IDS[1];
const bookmakerOf=(price:string)=>SOURCES.find(b=>PRICE[b]===price)!;

describe('P5 public-card slip / native source matrix',()=>{
  for(const count of [1,2,3,5,10])for(const mode of ['real','betano','alternate','mixed','incomplete'] as const)it(`${count} legs / ${mode}`,()=>{
    const f=withPublicCards(comparisonFixture(count));
    for(const [index,read] of [...f.data.fixtures.values()].entries()){
      const base=read.snapshot.quotes[0];
      read.snapshot.quotes=SOURCES.map(bookmaker=>({...base,bookmaker,bookmakerName:bookmaker,quoteId:`${index}-${bookmaker}`,decimalOdds:PRICE[bookmaker]}));
      const branch=mode==='mixed'?(index%3===0?'real':index%3===1?'betano':'alternate'):mode;
      if(branch==='betano'||branch==='alternate')read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker!==TARGET&&(branch!=='alternate'||q.bookmaker!==BETANO));
      if(mode==='incomplete'&&index===count-1)read.snapshot.quotes=[];
    }
    const before=JSON.stringify([...f.data.fixtures.values()]);
    const result=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    expect(result.bookmakers.map(b=>b.bookmakerId)).toEqual(PUBLIC_CARD_IDS);
    const target=result.bookmakers[0];
    if(mode==='incomplete'){
      expect(result.bookmakers.every(b=>b.priceClassification==='INCOMPLETE'&&b.combinedDecimalOdds===null&&b.ctaState==='INCOMPLETE')).toBe(true);
    }else{
      const expected=f.selections.map((_,i)=>mode==='betano'?PRICE[BETANO]:mode==='alternate'?PRICE[ALTERNATE]:mode==='mixed'?[PRICE[TARGET],PRICE[BETANO],PRICE[ALTERNATE]][i%3]:PRICE[TARGET]);
      expect(target.combinedDecimalOdds).toBe(multiplyDecimalOdds(expected));
      expect(potentialReturn('10',target.combinedDecimalOdds!)).toBe(potentialReturn('10',multiplyDecimalOdds(expected)!));
      expect(target.priceClassification).toBe(expected.every(p=>p===PRICE[TARGET])?'REAL_COMPLETE':'ESTIMATED_COMPLETE');
      target.selectionQuotes.forEach((q,i)=>{expect(q.sourceBookmakerId).toBe(bookmakerOf(expected[i]));expect(q.sourceQuoteId).toBe(`${i}-${q.sourceBookmakerId}`);});
      expect(target.ctaState).toBe('ENABLED');expect(result.bookmakers.slice(1).every(b=>b.ctaState==='AFFILIATE_UNAVAILABLE')).toBe(true);
      expect(guardSlipComparison(result,count,f.now+3600000).bookmakers.every(b=>b.combinedDecimalOdds===null)).toBe(true);
    }
    expect(JSON.stringify([...f.data.fixtures.values()])).toBe(before);
  });
});
