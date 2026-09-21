import {describe,expect,it} from 'vitest';
import {publicSlipResolution} from './public-response';
import type {FullSlipResolution} from './comparison-types';

describe('public slip provenance boundary',()=>{
  it('removes source identity from selections and comparison quotes without changing price classification',()=>{
    const price={decimalOdds:'2.10',bookmaker:'sportingbet.bet.br',bookmakerName:'Sportingbet BR',best:true,expiresAt:'2026-09-21T01:00:00Z',
      priceKind:'PROXY' as const,sourceBookmaker:'betano.bet.br',sourceQuoteId:'private-quote-id',sourceObservedAt:'2026-09-21T00:00:00Z'};
    const selection={fixturePublicId:'1111111111111111',scope:'FULL_TIME_REGULATION' as const,market:'MATCH_WINNER' as const,outcome:'HOME' as const,line:null};
    const fixture={publicId:'1111111111111111',home:'A',away:'B',competition:'Test',kickoff:'2026-09-21T02:00:00Z',status:'SCHEDULED'};
    const quote={selection,fixture,state:'CURRENT' as const,reason:null,diagnosticCode:'PROXY_QUOTE' as const,decimalOdds:'2.10',expiresAt:price.expiresAt,
      closesAt:fixture.kickoff,priceKind:'PROXY' as const,sourceBookmakerId:'betano.bet.br',sourceBookmakerName:'Betano BR',sourceQuoteId:'private-quote-id',sourceObservedAt:price.sourceObservedAt};
    const input={locale:'br' as const,resolvedAt:'2026-09-21T00:00:00Z',providerRequests:0 as const,
      selections:[{selection,fixture,state:'CURRENT' as const,reason:null,price,closesAt:fixture.kickoff}],comparison:{version:1 as const,locale:'br' as const,states:['ONE_SELECTION' as const],
        bookmakers:[{bookmakerId:'sportingbet.bet.br',displayName:'Sportingbet BR',geoEligibility:{locale:'br' as const,eligible:true},affiliateEligibility:{approved:false,destinationConfigured:false},
          priceClassification:'ESTIMATED_COMPLETE' as const,requiredSelectionCount:1,availableSelectionCount:1,realSelectionCount:0,proxySelectionCount:1,missingSelections:[],invalidSelections:[],
          complete:true,estimated:true,availabilityState:'ESTIMATED_COMPLETE' as const,selectionQuotes:[quote],combinedDecimalOdds:'2.10',best:true,tiedBest:false,ctaState:'AFFILIATE_UNAVAILABLE' as const,outboundCapability:'NONE' as const}],
        expiresAt:price.expiresAt,generatedAt:'2026-09-21T00:00:00Z'}} satisfies FullSlipResolution;
    const output=publicSlipResolution(input),json=JSON.stringify(output);
    expect(output.selections[0].price).toMatchObject({decimalOdds:'2.10',priceKind:'PROXY'});
    expect(output.comparison.bookmakers[0].selectionQuotes[0]).toMatchObject({decimalOdds:'2.10',priceKind:'PROXY'});
    expect(json).not.toMatch(/sourceBookmaker|sourceQuoteId|sourceObservedAt|betano\.bet\.br|private-quote-id/);
    expect(input.selections[0].price.sourceBookmaker).toBe('betano.bet.br');
  });
});
