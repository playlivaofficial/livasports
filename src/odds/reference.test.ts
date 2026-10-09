import {describe,it,expect} from 'vitest';
import {buildComparison,selectIndicativeQuote} from './comparison';
import {REFERENCE_DISPLAY_POLICY,referenceDisplayAllowed} from './reference-policy';
import {resolveSelection,guardResolved} from '@/slip/resolution';
import {buildSlipComparison} from '@/slip/comparison';
import {publicSlipResolution} from '@/slip/public-response';
import {publicOddsComparisons} from './public-response';
import {indicativeCombined} from '@/slip/indicative';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';
import type {CanonicalSelection} from '@/slip/types';
const now=Date.parse('2026-10-08T20:00:00Z'),kickoff='2026-10-09T01:00:00Z';
const selection:CanonicalSelection={fixturePublicId:'abcdef0123456789',scope:'FULL_TIME_REGULATION',market:'MATCH_WINNER',outcome:'HOME',line:null};
const quote:ReadOddsQuote={quoteId:'source-quote',fixtureId:'fixture',providerFixtureId:'provider-fixture',provider:'ODDSPAPI',bookmaker:'bwin',bookmakerId:'book',bookmakerName:'bwin',
 market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'1.85',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:new Date(now).toISOString(),
 observedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),providerKickoff:kickoff,geoEligible:true,sourceDomain:'sports.bwin.com',freshnessTtlMinutes:125};
const reference={...quote,sourceGeo:'CO',targetGeo:'MX',providerBookmakerId:'bwin'};
const snapshot:OddsReadSnapshot={fixtureId:'fixture',kickoff,fixtureStatus:'SCHEDULED',quotes:[],eligibleBookmakers:[{id:'betsson',name:'Betsson',priority:1}],insuranceEnabled:false,referenceQuotes:[reference]};
const read=(s=snapshot)=>({fixture:{publicId:selection.fixturePublicId,home:'Home',away:'Away',competition:'Liga MX',kickoff,status:'SCHEDULED'},snapshot:s});
const config={bookmakerId:'betsson',displayName:'Betsson',insuranceEnabled:false,geoEligibility:{locale:'mx' as const,eligible:true},affiliateEligibility:{approved:true,destinationConfigured:true}};
describe('cross-GEO informational references',()=>{
 it('uses owner-confirmed authorization only and fails closed when revoked or outside scope',()=>{
  expect(REFERENCE_DISPLAY_POLICY.status).toBe('OWNER_CONFIRMED');
  for(const geo of ['MX','CO','PE'])expect(referenceDisplayAllowed(geo)).toBe(true);
  for(const geo of ['BR','ROW',null])expect(referenceDisplayAllowed(geo)).toBe(false);
  expect(referenceDisplayAllowed('MX',{...REFERENCE_DISPLAY_POLICY,status:'UNVERIFIED'})).toBe(false);
  expect(referenceDisplayAllowed('MX',{...REFERENCE_DISPLAY_POLICY,enabled:false})).toBe(false);
 });
 it('preserves actual provenance publicly without adding a bookmaker row or action',()=>{
  const result=publicOddsComparisons([buildComparison(snapshot,'MATCH_WINNER',now,{bwin:'/fake',betsson:'/real'})])[0];
  expect(result.rows).toEqual([]);expect(result.eligiblePrices).toBe(0);
  expect(result.references?.[0]).toMatchObject({kind:'INDICATIVE',bookmaker:'bwin',quoteId:'source-quote',sourceGeo:'CO',sourceDomain:'sports.bwin.com',observedAt:quote.observedAt,affiliateEligible:false,executable:false});
  const resolved=publicSlipResolution({locale:'mx' as const,resolvedAt:new Date(now).toISOString(),providerRequests:0 as const,selections:[resolveSelection(selection,read(),now)]});
  expect(resolved.selections[0]).toMatchObject({coverage:'INDICATIVE',price:{sourceBookmaker:'bwin',sourceQuoteId:'source-quote',priceKind:'INDICATIVE'}});
 });
 it.each([{market:'BTTS'},{outcome:'AWAY'},{line:1.5},{scope:'EXTRA_TIME'},{phase:'LIVE'},{fixtureId:'other'},{provider:'OTHER'},{providerBookmakerId:'unverified'},
  {geoEligible:false},{sourceGeo:'BR'},{targetGeo:'BR'},{status:'SUSPENDED'},{status:'CLOSED'},{sourceDomain:null},{decimalOdds:'NaN'},
  {observedAt:new Date(now-126*60000).toISOString()},{lastSuccessfulRefreshAt:new Date(now-126*60000).toISOString()},
  {providerKickoff:'2026-10-09T02:00:00Z'}])('rejects mismatched, stale or unverified reference %j',override=>{
  const value={...snapshot,referenceQuotes:[{...reference,...override}]} as OddsReadSnapshot;
  expect(selectIndicativeQuote(value,'MATCH_WINNER','HOME',null,now)).toBeNull();
 });
 it('rejects duplicate ambiguous source quotes rather than cherry-picking',()=>{
  expect(buildComparison({...snapshot,referenceQuotes:[reference,{...reference,decimalOdds:'9.00'}]},'MATCH_WINNER',now).references??[]).toEqual([]);
 });
 it('prefers same-GEO reference over a newer foreign quote, never by the largest price',()=>{
  const local={...reference,targetGeo:'CO',bookmaker:'betsson',providerBookmakerId:'betsson',quoteId:'local',decimalOdds:'1.70'};
  const foreign={...reference,targetGeo:'CO',sourceGeo:'PE',bookmaker:'1xbet',providerBookmakerId:'1xbet',quoteId:'foreign',decimalOdds:'2.90',observedAt:new Date(now+1000).toISOString()};
  const value={...snapshot,referenceQuotes:[foreign,local]};
  expect(selectIndicativeQuote(value,'MATCH_WINNER','HOME',null,now+1000)?.quoteId).toBe('local');
  expect(selectIndicativeQuote({...value,referenceQuotes:[foreign,{...local,status:'SUSPENDED'}]},'MATCH_WINNER','HOME',null,now+1000)?.quoteId).toBe('foreign');
 });
 it('restores REAL automatically, prioritizing a local price even when numerically lower',()=>{
  const before=resolveSelection(selection,read(),now);expect(before.coverage).toBe('INDICATIVE');
  const recovered={...snapshot,quotes:[{...quote,bookmaker:'betsson',bookmakerName:'Betsson',decimalOdds:'1.60'}]};
  expect(resolveSelection(selection,read(recovered),now)).toMatchObject({coverage:'REAL',price:{priceKind:'REAL',bookmaker:'betsson',decimalOdds:'1.60'}});
  expect(buildComparison(recovered,'MATCH_WINNER',now).references??[]).toEqual([]);
  expect(guardResolved(before,now+126*60000)).toMatchObject({coverage:'UNAVAILABLE',price:null});
 });
 it('never fills a missing bookmaker leg from the reference channel',()=>{
  const second={...selection,fixturePublicId:'1111111111111111'};
  const third={...selection,fixturePublicId:'2222222222222222'};
  const local=read({...snapshot,quotes:[{...quote,bookmaker:'betsson'}]});
  const fixtures=new Map([[selection.fixturePublicId,local],[second.fixturePublicId,local],[third.fixturePublicId,read()]]);
  const book=buildSlipComparison([selection,second,third],'mx',fixtures,[config],now).bookmakers[0];
  expect(book).toMatchObject({availableSelectionCount:2,requiredSelectionCount:3,complete:false,combinedDecimalOdds:null,ctaState:'INCOMPLETE'});
  const values=[resolveSelection(selection,local,now),resolveSelection(second,local,now),resolveSelection(third,read(),now)];
  expect(indicativeCombined(values,now)).not.toBeNull();expect(indicativeCombined(values,now+126*60000)).toBeNull();
 });
 it('suppresses a reference whenever any local operator covers the exact outcome',()=>{
  const local={...reference,targetGeo:'PE',sourceGeo:'PE',bookmaker:'1xbet',bookmakerName:'1xBet',providerBookmakerId:'1xbet',sourceDomain:'1xbet.com',decimalOdds:'2.74'};
  const value:OddsReadSnapshot={...snapshot,referenceGapBookmakers:['inkabet','1xbet'],eligibleBookmakers:[{id:'1xbet',name:'1xBet',priority:2}],quotes:[local],referenceQuotes:[local]};
  const result=buildComparison(value,'MATCH_WINNER',now,{'1xbet':'/real','inkabet':'/not-an-offer'});
  expect(result.rows.map(r=>r.bookmaker)).toEqual(['1xbet']);
  expect(result.rows[0]).toMatchObject({action:'/real',cells:[{outcome:'HOME',decimalOdds:'2.74',priceKind:'REAL',best:false},{outcome:'DRAW',decimalOdds:null},{outcome:'AWAY',decimalOdds:null}]});
  expect(result.references??[]).toEqual([]);
  const recovered={...value,eligibleBookmakers:[...value.eligibleBookmakers!,{id:'inkabet',name:'Inkabet',priority:1}],quotes:[local,{...local,quoteId:'inkabet-real',bookmaker:'inkabet',bookmakerName:'Inkabet',decimalOdds:'2.50'}]};
  expect(buildComparison(recovered,'MATCH_WINNER',now).references??[]).toEqual([]);
 });
 it.each([
  {fixture:'CO Chelsea–Bournemouth',geo:'CO',book:'bwin',other:'betsson',prices:['1.66','4.20','4.60']},
  {fixture:'PE Hull City–Everton',geo:'PE',book:'1xbet',other:'inkabet',prices:['3.82','3.62','2.10']},
  {fixture:'PE Crystal Palace–Nottingham Forest',geo:'PE',book:'1xbet',other:'inkabet',prices:['2.00','3.40','3.60']},
  {fixture:'PE Liverpool–Manchester City',geo:'PE',book:'1xbet',other:'inkabet',prices:['2.40','3.60','2.80']},
 ])('does not duplicate covered outcomes in $fixture',({geo,book,other,prices})=>{
  const outcomes=['HOME','DRAW','AWAY'] as const;
  const native=outcomes.map((outcome,index)=>({...quote,quoteId:`native-${outcome}`,outcome,bookmaker:book,decimalOdds:prices[index]}));
  const refs=outcomes.map(outcome=>({...reference,targetGeo:geo,quoteId:`reference-${outcome}`,outcome}));
  const result=buildComparison({...snapshot,eligibleBookmakers:[{id:other,name:other,priority:1},{id:book,name:book,priority:2}],referenceGapBookmakers:[other,book],quotes:native,referenceQuotes:refs},'MATCH_WINNER',now);
  expect(result.references??[]).toEqual([]);
  expect(result.rows.find(r=>r.bookmaker===book)?.cells.map(c=>c.decimalOdds)).toEqual(prices);
  expect(result.rows.find(r=>r.bookmaker===other)?.cells.every(c=>c.decimalOdds===null)).toBe(true);
 });
 it('keeps only uncovered DRAW/AWAY references when just one operator prices HOME',()=>{
  const refs=(['HOME','DRAW','AWAY'] as const).map(outcome=>({...reference,quoteId:outcome,outcome}));
  const result=buildComparison({...snapshot,referenceGapBookmakers:['betsson','bwin'],quotes:[{...quote,bookmaker:'betsson'}],referenceQuotes:refs},'MATCH_WINNER',now);
  expect(result.references?.map(q=>q.outcome)).toEqual(['DRAW','AWAY']);
 });
 it('does not let a covered HOME outcome suppress DRAW or AWAY gaps, or expand an empty GEO pool',()=>{
  const books=[{id:'betsson',name:'Betsson',priority:1},{id:'bwin',name:'bwin',priority:2}];
  const native=[{...quote,bookmaker:'betsson'},quote];
  const foreign={...reference,targetGeo:'CO',sourceGeo:'PE',providerBookmakerId:'1xbet',bookmaker:'1xbet'};
  const value={...snapshot,eligibleBookmakers:books,referenceGapBookmakers:books.map(b=>b.id),quotes:native,referenceQuotes:[foreign,{...foreign,outcome:'DRAW' as const,quoteId:'draw'},{...foreign,outcome:'AWAY' as const,quoteId:'away'}]};
  expect(buildComparison(value,'MATCH_WINNER',now).references?.map(q=>q.outcome)).toEqual(['DRAW','AWAY']);
  expect(buildComparison({...value,referenceGapBookmakers:[]},'MATCH_WINNER',now).references).toBeUndefined();
 });
 it('does not relax reference expiry to fill a partial local gap',()=>{
  const value={...snapshot,referenceGapBookmakers:['betsson','bwin'],quotes:[{...quote,bookmaker:'betsson'}],referenceQuotes:[{...reference,observedAt:new Date(now-126*60000).toISOString(),freshnessTtlMinutes:8000}]};
  expect(buildComparison(value,'MATCH_WINNER',now).references??[]).toEqual([]);
 });
});
