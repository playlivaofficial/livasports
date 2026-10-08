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
});
