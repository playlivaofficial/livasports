import {describe,it,expect} from 'vitest';
import {comparisonFixture} from './comparison-fixtures.test-support';
import {buildSlipComparison,guardSlipComparison} from './comparison';
import {multiplyDecimalOdds,potentialReturn} from './decimal';

describe('P5 three-visible slip / four-native source matrix',()=>{
  for(const count of [1,2,3,5,10])for(const mode of ['real','betano','alternate','mixed','incomplete'] as const)it(`${count} legs / ${mode}`,()=>{
    const f=comparisonFixture(count);
    f.data.bookmakers.push({bookmakerId:'betboo.bet.br',displayName:'betboo BR',geoEligibility:{locale:'br',eligible:true},affiliateEligibility:{approved:false,destinationConfigured:false}});
    for(const [index,read] of [...f.data.fixtures.values()].entries()){
      const base=read.snapshot.quotes[0];
      read.snapshot.quotes=['betsson','sportingbet.bet.br','betboo.bet.br','betano.bet.br'].map((bookmaker,i)=>({...base,bookmaker,bookmakerName:bookmaker,quoteId:`${index}-${bookmaker}`,decimalOdds:String(i+2)}));
      const branch=mode==='mixed'?(index%3===0?'real':index%3===1?'betano':'alternate'):mode;
      if(branch==='betano'||branch==='alternate')read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker!=='betsson'&&(branch!=='alternate'||q.bookmaker!=='betano.bet.br'));
      if(mode==='incomplete'&&index===count-1)read.snapshot.quotes=[];
    }
    const before=JSON.stringify([...f.data.fixtures.values()]);
    const result=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    expect(result.bookmakers.map(b=>b.bookmakerId)).toEqual(['betsson','sportingbet.bet.br','betboo.bet.br']);
    const target=result.bookmakers[0];
    if(mode==='incomplete'){
      expect(result.bookmakers.every(b=>b.priceClassification==='INCOMPLETE'&&b.combinedDecimalOdds===null&&b.ctaState==='INCOMPLETE')).toBe(true);
    }else{
      const expected=f.selections.map((_,i)=>mode==='betano'?'5':mode==='alternate'?'3':mode==='mixed'?['2','5','3'][i%3]:'2');
      expect(target.combinedDecimalOdds).toBe(multiplyDecimalOdds(expected));
      expect(potentialReturn('10',target.combinedDecimalOdds!)).toBe(potentialReturn('10',multiplyDecimalOdds(expected)!));
      expect(target.priceClassification).toBe(expected.every(p=>p==='2')?'REAL_COMPLETE':'ESTIMATED_COMPLETE');
      target.selectionQuotes.forEach((q,i)=>{expect(q.sourceBookmakerId).toBe(expected[i]==='2'?'betsson':expected[i]==='5'?'betano.bet.br':'sportingbet.bet.br');expect(q.sourceQuoteId).toBe(`${i}-${q.sourceBookmakerId}`);});
      expect(target.ctaState).toBe('ENABLED');expect(result.bookmakers.slice(1).every(b=>b.ctaState==='AFFILIATE_UNAVAILABLE')).toBe(true);
      expect(guardSlipComparison(result,count,f.now+3600000).bookmakers.every(b=>b.combinedDecimalOdds===null)).toBe(true);
    }
    expect(JSON.stringify([...f.data.fixtures.values()])).toBe(before);
  });
});
