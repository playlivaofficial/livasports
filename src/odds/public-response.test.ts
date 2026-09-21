import {describe,expect,it} from 'vitest';
import {publicOddsComparisons} from './public-response';
import type {OddsComparison} from './types';

describe('public odds provenance boundary',()=>{
  it('keeps target price state but strips fallback identity and internal quote IDs',()=>{
    const input=[{market:'MATCH_WINNER',line:null,observedAt:'2026-09-21T00:00:00Z',providerUpdatedAt:null,expiresAt:'2026-09-21T01:00:00Z',eligiblePrices:1,
      rows:[{bookmaker:'sportingbet.bet.br',name:'Sportingbet BR',action:null,cells:[{outcome:'HOME',decimalOdds:'2.10',state:'ACTIVE',best:true,
        expiresAt:'2026-09-21T01:00:00Z',priceKind:'PROXY',targetBookmaker:'sportingbet.bet.br',sourceBookmaker:'betano.bet.br',
        sourceBookmakerName:'Betano BR',sourceQuoteId:'private-quote-id',sourceObservedAt:'2026-09-21T00:00:00Z'}]}]}] as OddsComparison[];
    const output=publicOddsComparisons(input),json=JSON.stringify(output);
    expect(output[0].rows[0].cells[0]).toMatchObject({decimalOdds:'2.10',priceKind:'PROXY',targetBookmaker:'sportingbet.bet.br'});
    expect(json).not.toMatch(/sourceBookmaker|sourceQuoteId|sourceObservedAt|betano\.bet\.br|private-quote-id/);
    expect(input[0].rows[0].cells[0].sourceBookmaker).toBe('betano.bet.br');
  });
});
