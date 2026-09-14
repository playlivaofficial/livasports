import {describe,it,expect} from 'vitest';
import {freshnessTtlMs} from '@/odds/scheduler-policy';
import {buildSlipComparison,guardSlipComparison} from './comparison';
import {multiplyDecimalOdds,formatCombinedOdds,compareDecimal,validDecimalOdds,potentialReturn,parseStake,formatMoney} from './decimal';
import {comparisonFixture} from './comparison-fixtures.test-support';
import {parseResolutionRequest} from './types';

describe('M7 exact decimal arithmetic',()=>{
  it('multiplies two and ten prices without individual rounding',()=>{
    expect(multiplyDecimalOdds(['2.10','1.80'])).toBe('3.78');
    expect(multiplyDecimalOdds(Array(10).fill('1.1'))).toBe('2.5937424601');
    expect(multiplyDecimalOdds(['2.10','1.80','1.60'])).toBe('6.048');
    expect(multiplyDecimalOdds(['2.10','1.75','1.90'])).toBe('6.9825');
    expect(multiplyDecimalOdds(['2.123456789123456789','1.01'])).toBe('2.14469135701469135689');
    expect(multiplyDecimalOdds(Array(10).fill('1000'))).toBe('1000000000000000000000000000000');
  });
  it('rounds the final price only, using locale-specific display and exact ties',()=>{
    expect(formatCombinedOdds('6.048','br')).toBe('6,05');expect(formatCombinedOdds('6.048','mx')).toBe('6.05');expect(formatCombinedOdds('6.048','en')).toBe('6.05');
    expect(formatCombinedOdds('9.995','br')).toBe('10,00');
    expect(formatCombinedOdds('1000000000000000000000000000000','mx')).toBe('1,000,000,000,000,000,000,000,000,000,000.00');
    expect(compareDecimal('6.048','6.04800')).toBe(0);expect(compareDecimal('6.04800000001','6.048')).toBe(1);
  });
  it.each(['NaN','Infinity','-1','1','1000.01','1e2','2;DROP','0','1.1234567890123456789'])('rejects unsafe odds %s',v=>expect(validDecimalOdds(v)).toBe(false));
  it('does not price an empty or over-limit slip',()=>{expect(multiplyDecimalOdds([])).toBeNull();expect(multiplyDecimalOdds(Array(11).fill('2'))).toBeNull();});
  it('computes informational potential return from displayed combined odds',()=>{
    expect(parseStake('10')).toBe('10');expect(parseStake('10,5')).toBe('10.5');expect(parseStake('-2')).toBeNull();expect(parseStake('NaN')).toBeNull();
    expect(potentialReturn('10','6.048')).toBe('60.50');expect(formatMoney('60.50','br')).toBe('R$ 60,50');
    expect(formatCombinedOdds('6.9825','br')).toBe('6,98');expect(potentialReturn('10','6.9825')).toBe('69.80');
    expect(potentialReturn('10','9.20')).toBe('92.00');expect(potentialReturn('10','8.94')).toBe('89.40');
    expect(formatCombinedOdds('not-a-number','br')).toBe('');expect(formatCombinedOdds('not-a-number','br')).not.toBe('?');
  });
});

describe('M7 bookmaker completeness and price-only ranking',()=>{
  const run=(f:ReturnType<typeof comparisonFixture>)=>buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
  it('compares 3/3 exact selections independently and never favors the affiliate',()=>{
    const r=run(comparisonFixture());const [betsson,betano]=r.bookmakers;
    expect(betsson).toMatchObject({complete:true,availableSelectionCount:3,combinedDecimalOdds:'6.048',best:false,ctaState:'ENABLED',outboundCapability:'HOMEPAGE'});
    expect(betano).toMatchObject({complete:true,availableSelectionCount:3,combinedDecimalOdds:'6.45645',best:true,ctaState:'AFFILIATE_UNAVAILABLE',outboundCapability:'NONE'});
    expect(r.states).toContain('MULTIPLE_COMPLETE_BOOKMAKERS');
  });
  it('exposes useful 2/3 coverage without a partial total or CTA, and still ranks the complete book',()=>{
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const [a,b]=run(f).bookmakers;expect(a.best).toBe(true);expect(b).toMatchObject({complete:false,availableSelectionCount:2,combinedDecimalOdds:null,best:false,ctaState:'INCOMPLETE'});
    expect(b.missingSelections.map(q=>q.selection)).toEqual([f.selections[1]]);
  });
  it('shows 0/3 and retains the exact missing selections',()=>{
    const f=comparisonFixture();for(const r of f.data.fixtures.values())r.snapshot.quotes=[];
    for(const b of run(f).bookmakers){expect(b.availableSelectionCount).toBe(0);expect(b.missingSelections).toHaveLength(3);expect(b.combinedDecimalOdds).toBeNull();}
  });
  it.each(['STALE','SUSPENDED','CLOSED','HISTORICAL','UNKNOWN'])('excludes %s and cannot retain a total or win',state=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[1],{status:state});
    const [a,b]=run(f).bookmakers;expect(a.complete).toBe(true);expect(a.best).toBe(true);expect(b.complete).toBe(false);expect(b.combinedDecimalOdds).toBeNull();expect(b.best).toBe(false);
  });
  it.each(['LIVE','HALFTIME','FINISHED','POSTPONED','UNKNOWN'])('invalidates every bookmaker on fixture status %s',status=>{
    const f=comparisonFixture();const r=f.data.fixtures.get(f.selections[0].fixturePublicId)!;r.fixture.status=status;r.snapshot.fixtureStatus=status;
    for(const b of run(f).bookmakers){expect(b.complete).toBe(false);expect(b.invalidSelections).toHaveLength(1);expect(b.ctaState).toBe('INCOMPLETE');}
  });
  it('expires at the two-feed near-kickoff cadence plus one tick, and on the earlier provider kickoff',()=>{
    const f=comparisonFixture();f.now+=freshnessTtlMs(1,2);expect(run(f).bookmakers.every(b=>!b.complete&&b.combinedDecimalOdds===null)).toBe(true);
    const g=comparisonFixture();g.data.fixtures.get(g.selections[0].fixturePublicId)!.snapshot.quotes[0].providerKickoff=new Date(g.now-1).toISOString();
    expect(run(g).bookmakers[0].selectionQuotes[0].state).toBe('MATCH_STARTED');
  });
  it('updates prices and handles ties without affiliate bias',()=>{
    const f=comparisonFixture();for(const r of f.data.fixtures.values())r.snapshot.quotes[1].decimalOdds=r.snapshot.quotes[0].decimalOdds;
    expect(run(f).bookmakers.every(b=>b.best&&b.tiedBest)).toBe(true);
    f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[0].decimalOdds='2.20';
    expect(run(f).bookmakers[0]).toMatchObject({combinedDecimalOdds:'6.336',best:true,tiedBest:false});
    f.data.bookmakers[0].affiliateEligibility.destinationConfigured=false;expect(run(f).bookmakers[0]).toMatchObject({best:true,ctaState:'AFFILIATE_UNAVAILABLE'});
  });
  it('supports empty, one selection, and honest no-bookmaker states',()=>{
    expect(run(comparisonFixture(0)).states).toEqual(['EMPTY_SLIP']);
    const one=run(comparisonFixture(1));expect(one.states).toContain('ONE_SELECTION');expect(one.bookmakers[0].combinedDecimalOdds).toBe('2.1');
    const f=comparisonFixture();f.data.bookmakers=[];expect(run(f).states).toContain('MULTI_SELECTION_NO_BOOKMAKER');
  });
  it('keeps BR-eligible books when the UI locale changes but commercial GEO remains BR',()=>{
    const f=comparisonFixture();expect(buildSlipComparison(f.selections,'mx',f.data.fixtures,f.data.bookmakers,f.now).bookmakers).toHaveLength(2);
  });
  it('does not invent BR books when commercial GEO produced none',()=>{
    const f=comparisonFixture();f.data.bookmakers=[];expect(buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now).bookmakers).toEqual([]);
  });
  it('uses identical duplicate current quotes and fails closed on conflicting or corrupted prices',()=>{
    const f=comparisonFixture();const r=f.data.fixtures.get(f.selections[0].fixturePublicId)!;
    r.snapshot.quotes.push({...r.snapshot.quotes[0]});
    expect(run(f).bookmakers[0].complete).toBe(true);
    r.snapshot.quotes.push({...r.snapshot.quotes[0],decimalOdds:'2.99'});
    expect(run(f).bookmakers[0]).toMatchObject({complete:false,selectionQuotes:expect.arrayContaining([expect.objectContaining({reason:'INVALID_QUOTE'})])});
    const g=comparisonFixture();g.data.fixtures.get(g.selections[0].fixturePublicId)!.snapshot.quotes[1].decimalOdds='NaN';
    expect(run(g).bookmakers[1]).toMatchObject({complete:false,selectionQuotes:expect.arrayContaining([expect.objectContaining({reason:'INVALID_QUOTE'})])});
    expect(run(g).bookmakers[0].complete).toBe(true);
  });
  it('browser clock, offline and error guards withdraw totals, best labels and CTAs while keeping intent',()=>{
    const f=comparisonFixture();const current=run(f);
    for(const [now,online] of [[f.now+freshnessTtlMs(1,2),true],[f.now,false],[f.now+3600000,true]] as const){
      const guarded=guardSlipComparison(current,3,now,online);for(const b of guarded.bookmakers){expect(b.complete).toBe(false);expect(b.best).toBe(false);expect(b.combinedDecimalOdds).toBeNull();expect(b.ctaState).toBe('INCOMPLETE');expect(b.selectionQuotes.map(q=>q.selection)).toEqual(f.selections);}
    }
    expect(current.bookmakers[0].complete).toBe(true);
  });
});

describe('M7 exact canonical identity',()=>{
  it.each([{line:3.5},{market:'DRAW_NO_BET'},{market:'DOUBLE_CHANCE'},{market:'TO_QUALIFY'},{scope:'FIRST_HALF'},{phase:'LIVE'},{outcome:'UNDER'}])('never substitutes %j',change=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[0],change);
    expect(buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now).bookmakers[0].complete).toBe(false);
  });
  it('rejects non-2.5 totals, DNB, first-half input, extra provider identifiers, duplicates and >10',()=>{
    const f=comparisonFixture();for(const change of [{line:3.5},{market:'DRAW_NO_BET'},{scope:'FIRST_HALF'},{providerFixtureId:'123'},{fixturePublicId:'not-public'}])
      expect(parseResolutionRequest({locale:'br',selections:[{...f.selections[0],...change}]})).toBeNull();
    expect(parseResolutionRequest({locale:'br',selections:[f.selections[0],f.selections[0]]})).toBeNull();
    expect(parseResolutionRequest({locale:'br',selections:comparisonFixture(11).selections})).toBeNull();
    expect(parseResolutionRequest({locale:'br',selections:[f.selections[0],{...f.selections[0],market:'BTTS',outcome:'YES',line:null}]})).not.toBeNull();
  });
  it('prices compatible markets from the same fixture without substituting outcomes',()=>{
    const f=comparisonFixture(1);const home=f.selections[0];const btts={...home,market:'BTTS' as const,outcome:'YES' as const,line:null};
    const read=f.data.fixtures.get(home.fixturePublicId)!;
    read.snapshot.quotes.push(...read.snapshot.quotes.map(q=>({...q,market:'BTTS' as const,outcome:'YES' as const,line:null,decimalOdds:q.bookmaker==='betsson'?'1.70':'1.65'})));
    const r=buildSlipComparison([home,btts],'br',f.data.fixtures,f.data.bookmakers,f.now);
    expect(r.bookmakers[0]).toMatchObject({complete:true,availableSelectionCount:2,combinedDecimalOdds:'3.57'});
    expect(r.bookmakers[1].combinedDecimalOdds).toBe('3.5475');
    expect(r.generatedAt).toBe(new Date(f.now).toISOString());
  });
});

describe('explicit bookmaker availability',()=>{
  const run=(f:ReturnType<typeof comparisonFixture>)=>buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
  it.each([1,2,3,5])('marks both books complete for %s mixed-market legs',count=>{
    const r=run(comparisonFixture(count));
    expect(r.bookmakers).toHaveLength(2);
    for(const b of r.bookmakers){
      expect(b.complete).toBe(true);expect(b.availabilityState).toBe('COMPLETE');expect(b.combinedDecimalOdds).toBeTruthy();
      expect(b.availableSelectionCount).toBe(count);expect(b.selectionQuotes.every(q=>q.diagnosticCode==='COMPLETE')).toBe(true);
    }
    expect(r.states).toContain(count===1?'ONE_SELECTION':'MULTIPLE_COMPLETE_BOOKMAKERS');
  });
  it('keeps Betano complete and best when its CTA is gated',()=>{
    const r=run(comparisonFixture());
    expect(r.bookmakers[1]).toMatchObject({complete:true,availabilityState:'COMPLETE',ctaState:'AFFILIATE_UNAVAILABLE',best:true});
    expect(r.bookmakers[0]).toMatchObject({complete:true,ctaState:'ENABLED',best:false});
  });
  it('classifies a missing BTTS market as MARKET_UNAVAILABLE, not an aggregation bug',()=>{
    const f=comparisonFixture(1);const home=f.selections[0];const btts={...home,market:'BTTS' as const,outcome:'YES' as const,line:null};
    const r=buildSlipComparison([home,btts],'br',f.data.fixtures,f.data.bookmakers,f.now);
    expect(r.bookmakers[0].complete).toBe(false);expect(r.bookmakers[0].availabilityState).toBe('MARKET_UNAVAILABLE');
    expect(r.bookmakers[0].selectionQuotes[1].diagnosticCode).toBe('MARKET_MISSING');expect(r.bookmakers[0].combinedDecimalOdds).toBeNull();
  });
  it('classifies stale quotes as STALE_LEG without a fake total',()=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[1],{status:'STALE'});
    const betano=run(f).bookmakers[1];
    expect(betano).toMatchObject({complete:false,availabilityState:'STALE_LEG',combinedDecimalOdds:null,ctaState:'INCOMPLETE'});
    expect(betano.selectionQuotes[0].diagnosticCode).toBe('STALE_QUOTE');
  });
  it('classifies withdrawn quotes as WITHDRAWN_LEG',()=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[0],{status:'SUSPENDED'});
    expect(run(f).bookmakers[0]).toMatchObject({complete:false,availabilityState:'WITHDRAWN_LEG',combinedDecimalOdds:null});
    expect(run(f).bookmakers[0].selectionQuotes[0].diagnosticCode).toBe('WITHDRAWN');
  });
  it('keeps Betsson complete when Betano is missing one exact leg',()=>{
    const f=comparisonFixture();
    const quotes=f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes;
    quotes.splice(quotes.findIndex(q=>q.bookmaker==='betano.bet.br'),1);
    const [betsson,betano]=run(f).bookmakers;
    expect(betsson).toMatchObject({complete:true,availabilityState:'COMPLETE',availableSelectionCount:3,combinedDecimalOdds:'6.048'});
    expect(betano).toMatchObject({complete:false,availabilityState:'MISSING_LEG',combinedDecimalOdds:null,availableSelectionCount:2});
  });
  it('keeps Betano complete when Betsson is missing one exact leg',()=>{
    const f=comparisonFixture();
    const quotes=f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes;
    quotes.splice(quotes.findIndex(q=>q.bookmaker==='betsson'),1);
    const [betsson,betano]=run(f).bookmakers;
    expect(betsson).toMatchObject({complete:false,availabilityState:'MISSING_LEG',combinedDecimalOdds:null});
    expect(betano).toMatchObject({complete:true,availabilityState:'COMPLETE',combinedDecimalOdds:'6.45645'});
  });
  it('marks both books incomplete without inventing a combined total',()=>{
    const f=comparisonFixture();for(const r of f.data.fixtures.values())r.snapshot.quotes=[];
    for(const b of run(f).bookmakers){
      expect(b.complete).toBe(false);expect(b.combinedDecimalOdds).toBeNull();
      expect(b.availabilityState).toBe('MISSING_LEG');expect(b.availableSelectionCount).toBe(0);
    }
  });
});
