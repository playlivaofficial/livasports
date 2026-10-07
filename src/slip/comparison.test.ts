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
    const r=run(comparisonFixture());const [betsson,bwin]=r.bookmakers;
    expect(betsson).toMatchObject({complete:true,availableSelectionCount:3,combinedDecimalOdds:'6.048',best:false,ctaState:'ENABLED',outboundCapability:'HOMEPAGE'});
    expect(bwin).toMatchObject({complete:true,availableSelectionCount:3,combinedDecimalOdds:'6.45645',best:true,ctaState:'AFFILIATE_UNAVAILABLE',outboundCapability:'NONE'});
    expect(r.states).toContain('MULTIPLE_COMPLETE_BOOKMAKERS');
  });
  it('withholds a bookmaker accumulator when that bookmaker did not price every leg',()=>{
    // A combined price is a claim about one book's own market. Filling the gap from another book would
    // present a number no bookmaker is actually offering, so the whole card goes unavailable instead.
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const [a,b]=run(f).bookmakers;
    expect(b).toMatchObject({complete:false,estimated:false,realSelectionCount:2,proxySelectionCount:0,combinedDecimalOdds:null,ctaState:'INCOMPLETE'});
    expect(b.missingSelections).toHaveLength(1);
    // The missing leg is retained and stays honestly unpriced, never backfilled from Betsson.
    expect(b.selectionQuotes[1]).toMatchObject({decimalOdds:null,priceKind:null,sourceBookmakerId:null});
    // Every leg it did price is still its own.
    for(const q of b.selectionQuotes.filter(q=>q.decimalOdds!==null))expect(q.sourceBookmakerId).toBe(b.bookmakerId);
    // The book that priced everything is unaffected.
    expect(a.complete).toBe(true);
  });
  it('shows 0/3 and retains the exact missing selections',()=>{
    const f=comparisonFixture();for(const r of f.data.fixtures.values())r.snapshot.quotes=[];
    for(const b of run(f).bookmakers){expect(b.availableSelectionCount).toBe(0);expect(b.missingSelections).toHaveLength(3);expect(b.combinedDecimalOdds).toBeNull();}
  });
  it.each(['STALE','SUSPENDED','CLOSED','WITHDRAWN','HISTORICAL','UNKNOWN'])('withholds the accumulator rather than borrowing when the target leg is %s',state=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[1],{status:state});
    const [a,b]=run(f).bookmakers;
    expect(a.complete).toBe(true);
    expect(b).toMatchObject({complete:false,estimated:false,proxySelectionCount:0,combinedDecimalOdds:null,ctaState:'INCOMPLETE'});
    // The unusable leg keeps its honest state instead of being replaced by Betsson's 2.10.
    expect(b.selectionQuotes[0].state).not.toBe('CURRENT');
    expect(b.selectionQuotes[0]).toMatchObject({decimalOdds:null,priceKind:null,sourceBookmakerId:null});
  });
  it.each(['LIVE','HALFTIME','FINISHED','POSTPONED','UNKNOWN'])('invalidates every bookmaker on fixture status %s',status=>{
    const f=comparisonFixture();const r=f.data.fixtures.get(f.selections[0].fixturePublicId)!;r.fixture.status=status;r.snapshot.fixtureStatus=status;
    for(const b of run(f).bookmakers){expect(b.complete).toBe(false);expect(b.invalidSelections).toHaveLength(1);expect(b.ctaState).toBe('INCOMPLETE');}
  });
  it('expires both feeds at the freshness boundary and withholds an unusable target provider kickoff',()=>{
    const f=comparisonFixture();f.now+=freshnessTtlMs(1,2);expect(run(f).bookmakers.every(b=>!b.complete&&b.combinedDecimalOdds===null)).toBe(true);
    const g=comparisonFixture();g.data.fixtures.get(g.selections[0].fixturePublicId)!.snapshot.quotes[0].providerKickoff=new Date(g.now-1).toISOString();
    const betsson=run(g).bookmakers[0];
    expect(betsson.selectionQuotes[0].state).not.toBe('CURRENT');
    expect(betsson).toMatchObject({complete:false,combinedDecimalOdds:null});
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
  it('accepts identical duplicates and withholds the card when the target data is conflicting or corrupted',()=>{
    const f=comparisonFixture();const r=f.data.fixtures.get(f.selections[0].fixturePublicId)!;
    // An exact duplicate is unambiguous, so it is still that book's own price.
    r.snapshot.quotes.push({...r.snapshot.quotes[0]});
    expect(run(f).bookmakers[0].complete).toBe(true);
    // Two conflicting prices for one selection are ambiguous: the leg is unusable and nothing is
    // borrowed from bwin to paper over it.
    r.snapshot.quotes.push({...r.snapshot.quotes[0],decimalOdds:'2.99'});
    expect(run(f).bookmakers[0]).toMatchObject({complete:false,estimated:false,proxySelectionCount:0,combinedDecimalOdds:null});
    expect(run(f).bookmakers[0].selectionQuotes.every(q=>q.sourceBookmakerId!=='bwin')).toBe(true);
    const g=comparisonFixture();g.data.fixtures.get(g.selections[0].fixturePublicId)!.snapshot.quotes[1].decimalOdds='NaN';
    expect(run(g).bookmakers[1]).toMatchObject({complete:false,estimated:false,proxySelectionCount:0,combinedDecimalOdds:null});
    expect(run(g).bookmakers[1].selectionQuotes.every(q=>q.sourceBookmakerId!=='betsson')).toBe(true);
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
    const f=comparisonFixture();for(const quote of f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes)Object.assign(quote,change);
    expect(buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now).bookmakers.every(book=>!book.complete)).toBe(true);
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
  it.each([1,2,3,5,10])('marks both books complete for %s mixed-market legs',count=>{
    const r=run(comparisonFixture(count));
    expect(r.bookmakers).toHaveLength(2);
    for(const b of r.bookmakers){
      expect(b.complete).toBe(true);expect(b.availabilityState).toBe('COMPLETE');expect(b.combinedDecimalOdds).toBeTruthy();
      expect(b.availableSelectionCount).toBe(count);expect(b.selectionQuotes.every(q=>q.diagnosticCode==='COMPLETE')).toBe(true);
    }
    expect(r.states).toContain(count===1?'ONE_SELECTION':'MULTIPLE_COMPLETE_BOOKMAKERS');
  });
  it.each([3,5,10])('never manufactures one accumulator from %s legs split across two books',count=>{
    // Each book is missing a different subset of legs. Between them they cover every leg, which is
    // exactly the case that must NOT yield two complete cards: an accumulator is a claim about one
    // bookmaker own market, so neither book gets a combined price.
    const f=comparisonFixture(count);
    f.selections.forEach((selection,index)=>{
      const quotes=f.data.fixtures.get(selection.fixturePublicId)!.snapshot.quotes;
      const target=index%2===0?'betsson':'bwin';
      quotes.splice(quotes.findIndex(quote=>quote.bookmaker===target),1);
    });
    const result=run(f);
    expect(result.bookmakers).toHaveLength(2);
    expect(result.bookmakers.every(book=>!book.complete&&book.combinedDecimalOdds===null)).toBe(true);
    expect(result.bookmakers.every(book=>book.proxySelectionCount===0&&book.ctaState==='INCOMPLETE')).toBe(true);
    expect(result.bookmakers.every(book=>book.missingSelections.length>0)).toBe(true);
    // Every price that is shown belongs to the book it is shown under.
    for(const book of result.bookmakers)
      for(const q of book.selectionQuotes.filter(q=>q.decimalOdds!==null))expect(q.sourceBookmakerId).toBe(book.bookmakerId);
  });
  it('keeps bwin complete and best when its CTA is gated',()=>{
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
  it('withholds a stale target leg instead of replacing it with the peer price',()=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[1],{status:'STALE'});
    const bwin=run(f).bookmakers[1];
    expect(bwin).toMatchObject({complete:false,estimated:false,proxySelectionCount:0,combinedDecimalOdds:null});
    expect(bwin.selectionQuotes[0].state).not.toBe('CURRENT');
    expect(bwin.selectionQuotes[0]).toMatchObject({priceKind:null,sourceBookmakerId:null});
  });
  it('leaves Betsson incomplete when its leg is SUSPENDED and only bwin is CURRENT',()=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[0],{status:'SUSPENDED'});
    const betsson=run(f).bookmakers[0];
    expect(betsson).toMatchObject({complete:false,estimated:false,availableSelectionCount:2,proxySelectionCount:0,combinedDecimalOdds:null});
    // The bwin 2.15 belongs to bwin. It is never shown as Betsson suspended selection.
    expect(betsson.selectionQuotes[0]).toMatchObject({priceKind:null,sourceBookmakerId:null,decimalOdds:null});
  });
  it('regresses Botafogo–Grêmio Draw: bwin 3.70 stays bwin and never completes a suspended Betsson card',()=>{
    const f=comparisonFixture(1);const read=f.data.fixtures.get(f.selections[0].fixturePublicId)!;
    Object.assign(read.fixture,{home:'Botafogo',away:'Grêmio'});
    Object.assign(f.selections[0],{market:'MATCH_WINNER',outcome:'DRAW',line:null});
    for(const quote of read.snapshot.quotes)Object.assign(quote,{market:'MATCH_WINNER',outcome:'DRAW',line:null});
    Object.assign(read.snapshot.quotes.find(q=>q.bookmaker==='bwin')!,{decimalOdds:'3.70',status:'ACTIVE'});
    Object.assign(read.snapshot.quotes.find(q=>q.bookmaker==='betsson')!,{status:'SUSPENDED'});
    const [betsson,bwin]=run(f).bookmakers;
    expect(bwin.selectionQuotes[0]).toMatchObject({state:'CURRENT',priceKind:'REAL',decimalOdds:'3.70',sourceBookmakerId:'bwin'});
    expect(betsson).toMatchObject({complete:false,estimated:false,availableSelectionCount:0,requiredSelectionCount:1,proxySelectionCount:0,combinedDecimalOdds:null});
    expect(betsson.selectionQuotes[0]).toMatchObject({priceKind:null,decimalOdds:null,sourceBookmakerId:null});
  });
  it('leaves bwin incomplete when its leg is SUSPENDED and only Betsson is CURRENT',()=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[1],{status:'SUSPENDED'});
    const bwin=run(f).bookmakers[1];
    expect(bwin).toMatchObject({complete:false,estimated:false,availableSelectionCount:2,proxySelectionCount:0,combinedDecimalOdds:null});
    expect(bwin.selectionQuotes[0]).toMatchObject({priceKind:null,sourceBookmakerId:null,decimalOdds:null});
  });
  it('keeps Betsson complete and bwin incomplete when bwin is missing one exact leg',()=>{
    const f=comparisonFixture();
    const quotes=f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes;
    quotes.splice(quotes.findIndex(q=>q.bookmaker==='bwin'),1);
    const [betsson,bwin]=run(f).bookmakers;
    expect(betsson).toMatchObject({complete:true,availabilityState:'COMPLETE',availableSelectionCount:3,combinedDecimalOdds:'6.048'});
    expect(bwin).toMatchObject({complete:false,estimated:false,availableSelectionCount:2,realSelectionCount:2,proxySelectionCount:0,combinedDecimalOdds:null});
    expect(bwin.selectionQuotes[1]).toMatchObject({priceKind:null,sourceBookmakerId:null});
  });
  it('keeps bwin complete and Betsson incomplete when Betsson is missing one exact leg',()=>{
    const f=comparisonFixture();
    const quotes=f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes;
    quotes.splice(quotes.findIndex(q=>q.bookmaker==='betsson'),1);
    const [betsson,bwin]=run(f).bookmakers;
    expect(betsson).toMatchObject({complete:false,estimated:false,proxySelectionCount:0,combinedDecimalOdds:null});
    expect(betsson.selectionQuotes[1]).toMatchObject({priceKind:null,sourceBookmakerId:null});
    expect(bwin).toMatchObject({complete:true,availabilityState:'COMPLETE',combinedDecimalOdds:'6.45645'});
  });
  it('marks both books incomplete without inventing a combined total',()=>{
    const f=comparisonFixture();for(const r of f.data.fixtures.values())r.snapshot.quotes=[];
    for(const b of run(f).bookmakers){
      expect(b.complete).toBe(false);expect(b.combinedDecimalOdds).toBeNull();
      expect(b.availabilityState).toBe('MISSING_LEG');expect(b.availableSelectionCount).toBe(0);
    }
  });
  it('completes the card as soon as the target own quote arrives on the next read',()=>{
    // The automatic-recovery contract for slips: unavailable while the book is unpriced, complete the
    // moment the scheduler supplies that book own price. No deploy, no manual action.
    const f=comparisonFixture();const quotes=f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes;
    const target=quotes.splice(quotes.findIndex(q=>q.bookmaker==='betsson'),1)[0];
    expect(run(f).bookmakers[0]).toMatchObject({complete:false,estimated:false,proxySelectionCount:0,combinedDecimalOdds:null});
    quotes.push({...target,decimalOdds:'1.91',quoteId:'replacement-real'});
    expect(run(f).bookmakers[0]).toMatchObject({complete:true,estimated:false,realSelectionCount:3,proxySelectionCount:0,availabilityState:'COMPLETE'});
  });
  it.each(['STALE','SUSPENDED','CLOSED'] as const)('never proxies from a %s source',status=>{
    const f=comparisonFixture();const quotes=f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes;
    quotes.splice(quotes.findIndex(q=>q.bookmaker==='betsson'),1);
    Object.assign(quotes.find(q=>q.bookmaker==='bwin')!,{status});
    const betsson=run(f).bookmakers[0];expect(betsson.complete).toBe(false);expect(betsson.selectionQuotes[0].priceKind).toBeNull();
  });
  it('remains unavailable when neither bookmaker has a current exact quote',()=>{
    const f=comparisonFixture();const quotes=f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes;
    Object.assign(quotes.find(q=>q.bookmaker==='betsson')!,{status:'SUSPENDED'});
    Object.assign(quotes.find(q=>q.bookmaker==='bwin')!,{status:'STALE'});
    const [betsson,bwin]=run(f).bookmakers;
    expect(betsson).toMatchObject({complete:false,combinedDecimalOdds:null,proxySelectionCount:0});
    expect(bwin).toMatchObject({complete:false,combinedDecimalOdds:null,proxySelectionCount:0});
  });
  it('builds the presentation without mutating provider truth',()=>{
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const before=JSON.stringify([...f.data.fixtures.values()].map(read=>read.snapshot.quotes));
    const result=run(f);
    // Nothing is estimated any more: the book that lost a leg is simply incomplete, and either way the
    // stored provider quotes are untouched.
    expect(result.bookmakers.some(book=>book.estimated)).toBe(false);
    expect(result.bookmakers.some(book=>!book.complete)).toBe(true);
    expect(JSON.stringify([...f.data.fixtures.values()].map(read=>read.snapshot.quotes))).toBe(before);
  });
});
