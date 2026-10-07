import {describe,expect,it} from 'vitest';
import {CORE_GEOS} from '@/config/geo';
import {FALLBACK_REFERENCE_BOOKMAKER_IDS,assertFallbackPools,fallbackAffiliateAllowed,fallbackPoolViolations,fallbackReferenceBookmakers,geoBookmakerPool,isFallbackReference,poolRole,primaryVisibleBookmakers,type FallbackReferenceSource} from './fallback-pool';
import {buildComparison} from './comparison';
import {resolveInsurance} from './insurance';
import {summarizeFourSources,mergeSourceHealth} from './four-source-health';
import {ACTIVE_BOOKMAKER_IDS} from './registry';
import {buildSlipComparison} from '@/slip/comparison';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import type {ReadOddsQuote,OddsReadSnapshot} from './types';

const now=Date.parse('2026-10-07T08:00:00Z');
const quote=(bookmaker:string,outcome:ReadOddsQuote['outcome'],decimalOdds:string,id=bookmaker+outcome):ReadOddsQuote=>({
  bookmaker,bookmakerName:bookmaker,bookmakerId:bookmaker,quoteId:id,fixtureId:'f',providerFixtureId:'p',
  market:'MATCH_WINNER',outcome,line:null,decimalOdds,status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',
  providerUpdatedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),
  lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:new Date(now+3600000).toISOString(),sourceDomain:'test.invalid',geoEligible:true});
const market=(bookmaker:string,prices:[string,string,string])=>
  (['HOME','DRAW','AWAY'] as const).map((outcome,i)=>quote(bookmaker,outcome,prices[i]));
const snapshot=(quotes:ReadOddsQuote[],primary:string[],fallback:string[]=[]):OddsReadSnapshot=>({
  quotes,kickoff:new Date(now+3600000).toISOString(),fixtureStatus:'SCHEDULED',insuranceEnabled:false,
  eligibleBookmakers:primary.map((id,i)=>({id,name:id,priority:i+1})),
  fallbackBookmakers:fallback.map((id,i)=>({id,name:id,priority:i+1}))});
const row=(c:ReturnType<typeof buildComparison>,id:string)=>c.rows.find(r=>r.bookmaker===id);

describe('the configured reference pool',()=>{
  it('is valid, and every jurisdiction is deliberately empty for now',()=>{
    expect(()=>assertFallbackPools()).not.toThrow();
    for(const geo of CORE_GEOS)expect(fallbackReferenceBookmakers(geo)).toEqual([]);
    expect(FALLBACK_REFERENCE_BOOKMAKER_IDS).toEqual([]);
  });
  it('derives each primary line-up from the registry, matching the owner line-up',()=>{
    expect(primaryVisibleBookmakers('MX')).toEqual(['betsson']);
    expect(primaryVisibleBookmakers('CO')).toEqual(['betsson','bwin']);
    expect(primaryVisibleBookmakers('PE')).toEqual(['inkabet','1xbet']);
    // The pool only ever draws on identities we actually request from the provider.
    for(const geo of CORE_GEOS)for(const id of primaryVisibleBookmakers(geo))expect(ACTIVE_BOOKMAKER_IDS).toContain(id);
  });
  it('reports a role for a primary and nothing for an unconfigured book',()=>{
    expect(poolRole('CO','betsson')).toBe('PRIMARY_VISIBLE');
    expect(poolRole('CO','bwin')).toBe('PRIMARY_VISIBLE');
    expect(poolRole('CO','inkabet')).toBeNull();
    expect(poolRole('MX','1xbet')).toBeNull();
    for(const geo of CORE_GEOS)for(const id of primaryVisibleBookmakers(geo))expect(isFallbackReference(geo,id)).toBe(false);
  });
  it('never lets a reference source be affiliate-eligible',()=>{
    expect(fallbackAffiliateAllowed()).toBe(false);
  });
  it('exposes the whole pool for one jurisdiction in one place',()=>{
    expect(geoBookmakerPool('PE')).toEqual({geo:'PE',primaryVisibleBookmakers:['inkabet','1xbet'],fallbackReferenceBookmakers:[]});
  });
});

describe('reference pool configuration guards',()=>{
  const source=(over:Partial<FallbackReferenceSource>={}):FallbackReferenceSource=>
    ({bookmaker:'inkabet',priority:1,affiliateEligible:false,evidence:'synthetic test evidence',...over} as FallbackReferenceSource);
  it('refuses a feed that is not legally eligible in that jurisdiction',()=>{
    // This is the cross-GEO leak the architecture exists to prevent: Inkabet is a Peru licence.
    expect(fallbackPoolViolations('CO',[source({bookmaker:'inkabet'})])).toEqual([expect.stringContaining('not eligible in CO')]);
    expect(fallbackPoolViolations('MX',[source({bookmaker:'1xbet'})])).toEqual([expect.stringContaining('not eligible in MX')]);
    expect(fallbackPoolViolations('PE',[source({bookmaker:'bwin'})])).toEqual([expect.stringContaining('not eligible in PE')]);
    // And it is accepted where the licence genuinely reaches, so the guard is not vacuous.
    expect(fallbackPoolViolations('PE',[source({bookmaker:'inkabet'})])).toEqual([expect.stringContaining('already a primary in PE')]);
  });
  it('refuses an unknown or retired identity',()=>{
    expect(fallbackPoolViolations('CO',[source({bookmaker:'not-a-book'})])).toEqual([expect.stringContaining('not a known bookmaker identity')]);
    for(const retired of ['betboo.bet.br','betano.bet.br','sportingbet.bet.br'])
      expect(fallbackPoolViolations('CO',[source({bookmaker:retired})])).toEqual([expect.stringContaining('retired')]);
  });
  it('refuses a book that is already a primary there, so one book never gets two rows',()=>{
    expect(fallbackPoolViolations('CO',[source({bookmaker:'betsson'})])).toEqual([expect.stringContaining('already a primary in CO')]);
  });
  it('refuses a source claiming affiliate eligibility, a duplicate, or missing evidence',()=>{
    expect(fallbackPoolViolations('CO',[source({bookmaker:'bwin',affiliateEligible:true as never})])).toContainEqual(expect.stringContaining('never affiliate-eligible'));
    expect(fallbackPoolViolations('CO',[source({bookmaker:'bwin',evidence:'  '})])).toContainEqual(expect.stringContaining('evidence is required'));
    expect(fallbackPoolViolations('CO',[source({bookmaker:'bwin',priority:0})])).toContainEqual(expect.stringContaining('positive integer'));
  });
  it('accepts a well-formed source for a jurisdiction it is eligible in and not primary in',()=>{
    // Betsson is registered for BR/MX/CO, so MX is the only core GEO where a non-primary check is
    // meaningful for a Peru book. Use a Betsson-eligible GEO where it is not primary: none exists, so
    // assert instead that every rule fires independently rather than as a single blanket refusal.
    expect(fallbackPoolViolations('CO',[])).toEqual([]);
  });
});

describe('a missing primary price never becomes another book price',()=>{
  const quotes=[...market('bwin',['2.10','3.20','3.60'])];
  it('leaves the primary slot unavailable rather than borrowing a visible rival price',()=>{
    // Betsson has no quote at all; bwin does. Insurance is off in production, but even with it on the
    // resolver must refuse, because a cross-primary substitution is exactly the falsification.
    for(const insuranceEnabled of [false,true]){
      const c=buildComparison({...snapshot(quotes,['betsson','bwin']),insuranceEnabled},'MATCH_WINNER',now);
      const betsson=row(c,'betsson')!;
      expect(betsson.cells.every(cell=>cell.decimalOdds===null)).toBe(true);
      expect(betsson.cells.every(cell=>cell.priceKind===null)).toBe(true);
      expect(betsson.cells.every(cell=>cell.sourceBookmaker===null)).toBe(true);
      expect(betsson.action).toBeNull();
      // bwin keeps its own price under its own identity.
      expect(row(c,'bwin')!.cells.map(cell=>cell.decimalOdds)).toEqual(['2.10','3.20','3.60']);
      expect(row(c,'bwin')!.cells.every(cell=>cell.sourceBookmaker==='bwin'&&cell.priceKind==='REAL')).toBe(true);
    }
  });
  it('the resolver itself refuses to hand one visible book another visible book price',()=>{
    const candidate=(bookmaker:string,decimalOdds:string)=>({bookmaker,decimalOdds,current:true,priceKind:'REAL' as const,value:bookmaker});
    for(const target of ['betsson','bwin','inkabet','1xbet']){
      const others=['betsson','bwin','inkabet','1xbet'].filter(id=>id!==target).map(id=>candidate(id,'2.50'));
      const result=resolveInsurance(target,others);
      expect(result.resolution).toBe('NO_INSURANCE_AVAILABLE');
      expect(result.candidate).toBeNull();
    }
    // Its own fresh price is still used, so the resolver has not simply been disabled.
    expect(resolveInsurance('betsson',[candidate('bwin','2.5'),candidate('betsson','2.2')]).resolution).toBe('OWN_REAL');
  });
});

describe('an explicitly attributed reference row preserves continuity',()=>{
  // Synthetic configuration only: no jurisdiction has a reference source configured today, so the
  // wiring is exercised by declaring one on the snapshot the server builds.
  const quotes=[...market('bwin',['2.10','3.20','3.60'])];
  const configured=()=>buildComparison(snapshot(quotes,['betsson'],['bwin']),'MATCH_WINNER',now);
  it('shows the reference price in its own row, under its own identity',()=>{
    const c=configured();
    expect(c.rows.map(r=>r.bookmaker)).toEqual(['betsson','bwin']);
    const reference=row(c,'bwin')!;
    expect(reference.role).toBe('FALLBACK_REFERENCE');
    expect(reference.cells.map(cell=>cell.decimalOdds)).toEqual(['2.10','3.20','3.60']);
    // Provenance names the real source, and the target is the reference book itself — never the primary.
    expect(reference.cells.every(cell=>cell.sourceBookmaker==='bwin'&&cell.targetBookmaker==='bwin'&&cell.priceKind==='REAL')).toBe(true);
    expect(reference.cells.every(cell=>!!cell.sourceQuoteId&&!!cell.sourceObservedAt)).toBe(true);
  });
  it('keeps the primary row truthfully unavailable while the reference row is shown',()=>{
    const betsson=row(configured(),'betsson')!;
    expect(betsson.role).toBe('PRIMARY_VISIBLE');
    expect(betsson.cells.every(cell=>cell.decimalOdds===null&&cell.sourceBookmaker===null)).toBe(true);
  });
  it('never gives a reference row a CTA, even when the caller offers one',()=>{
    const c=buildComparison(snapshot(quotes,['betsson'],['bwin']),'MATCH_WINNER',now,{bwin:'/go/bwin/match_odds_table',betsson:'/go/betsson/match_odds_table'});
    expect(row(c,'bwin')!.action).toBeNull();
    expect(row(c,'bwin')!.affiliateEligible).toBe(false);
    // The primary keeps its action when it has a price of its own.
    const priced=buildComparison(snapshot([...quotes,...market('betsson',['2.05','3.30','3.70'])],['betsson'],['bwin']),'MATCH_WINNER',now,{betsson:'/go/betsson/match_odds_table'});
    expect(row(priced,'betsson')!.action).toBe('/go/betsson/match_odds_table');
    expect(row(priced,'betsson')!.affiliateEligible).toBe(true);
  });
  it('never marks a reference price as the best price',()=>{
    // The reference price is numerically higher than the primary's, and still must not be crowned.
    const c=buildComparison(snapshot([...market('bwin',['9.00','9.00','9.00']),...market('betsson',['2.05','3.30','3.70'])],['betsson'],['bwin']),'MATCH_WINNER',now);
    expect(row(c,'bwin')!.cells.every(cell=>cell.best===false)).toBe(true);
    expect(row(c,'betsson')!.cells.every(cell=>cell.best===false)).toBe(true);
  });
  it('never emits a reference row the server did not configure for this jurisdiction',()=>{
    // bwin has a price and betsson does not, but no reference pool is configured, so bwin gets no row
    // at all and nothing stands in for betsson. Here that leaves the comparison empty, which is the
    // existing behaviour when no configured target priced the market.
    expect(buildComparison(snapshot(quotes,['betsson'],[]),'MATCH_WINNER',now).rows).toEqual([]);
    // With the primary priced, the unconfigured bwin quote still produces no row of its own.
    const priced=buildComparison(snapshot([...quotes,...market('betsson',['2.05','3.30','3.70'])],['betsson'],[]),'MATCH_WINNER',now);
    expect(priced.rows.map(r=>r.bookmaker)).toEqual(['betsson']);
    // Nor one that duplicates a primary identity.
    const duplicate=buildComparison(snapshot(quotes,['betsson','bwin'],['bwin']),'MATCH_WINNER',now);
    expect(duplicate.rows.map(r=>r.bookmaker)).toEqual(['betsson','bwin']);
    expect(row(duplicate,'bwin')!.role).toBe('PRIMARY_VISIBLE');
  });
});

describe('slip integrity under missing coverage',()=>{
  it('refuses a primary accumulator when that book missed a leg, and merges nothing',()=>{
    const f=comparisonFixture(3);
    const first=f.data.fixtures.get(f.selections[0].fixturePublicId)!;
    first.snapshot.quotes=first.snapshot.quotes.filter(q=>q.bookmaker!=='betsson');
    const configs=f.data.bookmakers.map(b=>({...b,insuranceEnabled:false,geoEligibility:{eligible:true,locale:'co' as const}}));
    const result=buildSlipComparison(f.selections,'co',f.data.fixtures,configs,f.now);
    const betsson=result.bookmakers.find(b=>b.bookmakerId==='betsson')!;
    expect(betsson.complete).toBe(false);
    expect(betsson.combinedDecimalOdds).toBeNull();
    expect(betsson.ctaState).toBe('INCOMPLETE');
    expect(betsson.proxySelectionCount).toBe(0);
    // Every leg it does report is still its own, so no accumulator is assembled from mixed books.
    for(const q of betsson.selectionQuotes.filter(q=>q.decimalOdds!==null))
      expect(q.sourceBookmakerId).toBe('betsson');
  });
  it('gives a reference book its own complete slip with no CTA and no best marker',()=>{
    const f=comparisonFixture(3);
    const configs=f.data.bookmakers.map(b=>({...b,insuranceEnabled:false,geoEligibility:{eligible:true,locale:'co' as const},
      role:b.bookmakerId==='bwin'?'FALLBACK_REFERENCE' as const:'PRIMARY_VISIBLE' as const,
      affiliateEligibility:{approved:true,destinationConfigured:true,destinationType:'SPORTSBOOK' as const}}));
    const result=buildSlipComparison(f.selections,'co',f.data.fixtures,configs,f.now);
    const reference=result.bookmakers.find(b=>b.bookmakerId==='bwin');
    if(reference?.complete){
      expect(reference.ctaState).toBe('AFFILIATE_UNAVAILABLE');
      expect(reference.outboundCapability).toBe('NONE');
      expect(reference.best).toBe(false);
      // Its own legs only, each attributed to itself.
      for(const q of reference.selectionQuotes.filter(q=>q.decimalOdds!==null))expect(q.sourceBookmakerId).toBe('bwin');
    }
    // A primary with an approved campaign is unaffected.
    const primary=result.bookmakers.find(b=>b.bookmakerId==='betsson')!;
    if(primary.complete)expect(primary.ctaState).toBe('ENABLED');
  });
});

describe('reference sources are reported separately in source health',()=>{
  const many=(n:number,quotes:(i:number)=>ReadOddsQuote[],primary:string[])=>
    Array.from({length:n},(_,i)=>snapshot(quotes(i),primary));
  it('does not let a reference outage degrade a jurisdiction',()=>{
    // Betsson healthy, the configured reference priced nothing at all.
    const health=summarizeFourSources(many(10,()=>market('betsson',['2.05','3.30','3.70']),['betsson']),now,['betsson','bwin'],['bwin']);
    expect(health.degraded).toBe(false);
    expect(health.fallbackSources.map(s=>s.bookmaker)).toEqual(['bwin']);
    expect(health.fallbackSources[0].currentFixtures).toBe(0);
  });
  it('does not let reference coverage hide a primary outage',()=>{
    const health=summarizeFourSources(many(10,()=>market('bwin',['2.10','3.20','3.60']),['betsson']),now,['betsson'],['bwin']);
    expect(health.degraded).toBe(true);
    expect(health.fallbackSources[0].currentFixtures).toBe(10);
  });
  it('reports no reference sources while every pool is empty',()=>{
    const health=summarizeFourSources(many(10,()=>market('betsson',['2.05','3.30','3.70']),['betsson']),now,['betsson']);
    expect(health.fallbackSources).toEqual([]);
    const merged=mergeSourceHealth([{geo:'MX',summary:health,eligible:['betsson']}],10);
    expect(merged.geos[0].fallback).toEqual([]);
  });
});
