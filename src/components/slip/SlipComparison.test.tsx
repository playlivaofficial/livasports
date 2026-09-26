import {describe,it,expect,vi} from 'vitest';
vi.mock('@/affiliate/client',async()=>{const {displayOffer}=await import('@/affiliate/fixtures.test-support');return {useCommercialOffer:()=>displayOffer(),privacyOptOut:()=>false,qaBrowser:()=>true};});
import {renderToStaticMarkup} from 'react-dom/server';
import {SlipComparison} from './SlipComparison';
import {buildSlipComparison} from '@/slip/comparison';
import {comparisonFixture,PUBLIC_CARD_IDS,withPublicCards} from '@/slip/comparison-fixtures.test-support';
import {formatMoney,potentialReturn,formatSlipOdds} from '@/slip/decimal';

const BETANO='betano.bet.br';
const SOURCES=[...PUBLIC_CARD_IDS,BETANO];
const PRICE=Object.fromEntries(SOURCES.map((bookmaker,i)=>[bookmaker,String(i+2)]));
const CARDS=PUBLIC_CARD_IDS.length;
// The card under inspection is the second public one: it has no approved destination, so every
// provenance branch below is observed on a card that must still render a complete price.
const INSPECTED=PUBLIC_CARD_IDS[1];
// With the inspected card's own quote gone and Betano withheld, the cheapest surviving public card wins.
const LOWEST_ALTERNATE=PUBLIC_CARD_IDS.filter(id=>id!==INSPECTED)[0];

describe('P5 compact comparison / internal provenance',()=>{
  for(const locale of ['br','mx','en'] as const)for(const count of [1,2,5,10])for(const mode of ['native','betano','alternate','missing'] as const){
    it(`${locale} / ${count} selections / ${mode}`,()=>{
      const f=withPublicCards(comparisonFixture(count));
      for(const [i,read] of [...f.data.fixtures.values()].entries()){
        const base=read.snapshot.quotes[0];
        read.snapshot.quotes=SOURCES.map(bookmaker=>({...base,bookmaker,bookmakerName:bookmaker,quoteId:`${i}-${bookmaker}`,decimalOdds:PRICE[bookmaker]}));
        if(mode==='betano'||mode==='alternate')read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker!==INSPECTED&&(mode!=='alternate'||q.bookmaker!==BETANO));
        if(mode==='missing'&&i===count-1)read.snapshot.quotes=[];
      }
      const value=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
      const before=JSON.stringify(value);
      const html=renderToStaticMarkup(<SlipComparison locale="br" uiLocale={locale} stake="10" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={value}/>);
      expect(value.bookmakers.map(b=>b.bookmakerId)).toEqual(PUBLIC_CARD_IDS);
      expect(html.match(/class="slip-bookmaker"/g)).toHaveLength(CARDS);
      expect(html).not.toMatch(/estimated|estimad|based on|baseada|basada|Betano|betano|data-source|slip-proxy-legs|slip-missing|<ul/i);
      expect(html).not.toMatch(/NaN|guaranteed|profit/);
      expect(JSON.stringify(value)).toBe(before);
      const inspected=value.bookmakers[1];
      if(mode==='missing'){
        expect(inspected.complete).toBe(false);expect(html).not.toContain('class="slip-combined"');
        expect(value.bookmakers.every(b=>b.ctaState==='INCOMPLETE')).toBe(true);
      }else{
        const source=mode==='native'?INSPECTED:mode==='betano'?BETANO:LOWEST_ALTERNATE;
        expect(inspected.selectionQuotes.every(q=>q.sourceBookmakerId===source&&q.sourceQuoteId&&q.sourceObservedAt)).toBe(true);
        expect(inspected.priceClassification).toBe(mode==='native'?'REAL_COMPLETE':'ESTIMATED_COMPLETE');
        for(const b of value.bookmakers){
          expect(html).toContain(formatSlipOdds(b.combinedDecimalOdds!,locale));
          expect(html).toContain(formatMoney(potentialReturn('10',b.combinedDecimalOdds!)!,locale));
        }
        expect(html.match(/class="slip-return"/g)).toHaveLength(CARDS);
        expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
        expect(value.bookmakers.slice(1).every(b=>b.ctaState==='AFFILIATE_UNAVAILABLE')).toBe(true);
      }
    });
  }
  it('recalculates potential returns from stake without changing selection math',()=>{
    const f=comparisonFixture();const value=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const html=renderToStaticMarkup(<SlipComparison locale="br" stake="25" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={value}/>);
    for(const b of value.bookmakers)expect(html).toContain(formatMoney(potentialReturn('25',b.combinedDecimalOdds!)!,'br'));
  });
});
