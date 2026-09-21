import {describe,it,expect,vi} from 'vitest';
vi.mock('@/affiliate/client',async()=>{const {displayOffer}=await import('@/affiliate/fixtures.test-support');return {useCommercialOffer:()=>displayOffer(),privacyOptOut:()=>false,qaBrowser:()=>true};});
import {renderToStaticMarkup} from 'react-dom/server';
import {SlipComparison} from './SlipComparison';
import {buildSlipComparison} from '@/slip/comparison';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {formatMoney,potentialReturn,formatSlipOdds} from '@/slip/decimal';

describe('P5 compact comparison / internal provenance',()=>{
  for(const locale of ['br','mx','en'] as const)for(const count of [1,2,5,10])for(const mode of ['native','betano','alternate','missing'] as const){
    it(`${locale} / ${count} selections / ${mode}`,()=>{
      const f=comparisonFixture(count);
      f.data.bookmakers.push({bookmakerId:'betboo.bet.br',displayName:'betboo BR',geoEligibility:{locale:'br',eligible:true},affiliateEligibility:{approved:false,destinationConfigured:false}});
      for(const [i,read] of [...f.data.fixtures.values()].entries()){
        const base=read.snapshot.quotes[0];
        read.snapshot.quotes=['betsson','sportingbet.bet.br','betboo.bet.br','betano.bet.br'].map((bookmaker,j)=>({...base,bookmaker,bookmakerName:bookmaker,quoteId:`${i}-${bookmaker}`,decimalOdds:String(j+2)}));
        if(mode==='betano'||mode==='alternate')read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker!=='sportingbet.bet.br'&&(mode!=='alternate'||q.bookmaker!=='betano.bet.br'));
        // Alternate resolver picks the lowest eligible REAL quote, here betboo.
        if(mode==='alternate')read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker!=='betsson');
        if(mode==='missing'&&i===count-1)read.snapshot.quotes=[];
      }
      const value=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
      const before=JSON.stringify(value);
      const html=renderToStaticMarkup(<SlipComparison locale="br" uiLocale={locale} stake="10" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={value}/>);
      expect(value.bookmakers.map(b=>b.bookmakerId)).toEqual(['betsson','sportingbet.bet.br','betboo.bet.br']);
      expect(html.match(/class="slip-bookmaker"/g)).toHaveLength(3);
      expect(html).not.toMatch(/estimated|estimad|based on|baseada|basada|Betano|betano|data-source|slip-proxy-legs|slip-missing|<ul/i);
      expect(html).not.toMatch(/NaN|guaranteed|profit/);
      expect(JSON.stringify(value)).toBe(before);
      const sporting=value.bookmakers[1];
      if(mode==='missing'){
        expect(sporting.complete).toBe(false);expect(html).not.toContain('class="slip-combined"');
        expect(value.bookmakers.every(b=>b.ctaState==='INCOMPLETE')).toBe(true);
      }else{
        const source=mode==='native'?'sportingbet.bet.br':mode==='betano'?'betano.bet.br':'betboo.bet.br';
        expect(sporting.selectionQuotes.every(q=>q.sourceBookmakerId===source&&q.sourceQuoteId&&q.sourceObservedAt)).toBe(true);
        expect(sporting.priceClassification).toBe(mode==='native'?'REAL_COMPLETE':'ESTIMATED_COMPLETE');
        for(const b of value.bookmakers){
          expect(html).toContain(formatSlipOdds(b.combinedDecimalOdds!,locale));
          expect(html).toContain(formatMoney(potentialReturn('10',b.combinedDecimalOdds!)!,locale));
        }
        expect(html.match(/class="slip-return"/g)).toHaveLength(3);
        expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
        expect(sporting.ctaState).toBe('AFFILIATE_UNAVAILABLE');expect(value.bookmakers[2].ctaState).toBe('AFFILIATE_UNAVAILABLE');
      }
    });
  }
  it('recalculates potential returns from stake without changing selection math',()=>{
    const f=comparisonFixture();const value=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const html=renderToStaticMarkup(<SlipComparison locale="br" stake="25" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={value}/>);
    for(const b of value.bookmakers)expect(html).toContain(formatMoney(potentialReturn('25',b.combinedDecimalOdds!)!,'br'));
  });
});
