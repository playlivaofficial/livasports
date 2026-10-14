import {describe,it,expect} from 'vitest';
import {offerBatchSize} from './offer-batch';
import type {CommercialContext} from './types';
const context=(legs:number,cta:'logo'|'visit'='visit'):CommercialContext=>({locale:'pe',pagePath:'/pe',placement:'slip_bookmaker_comparison',bookmaker:'inkabet',cta,
  selections:Array.from({length:legs},(_,i)=>({fixturePublicId:i.toString(16).padStart(16,'0'),scope:'FULL_TIME_REGULATION' as const,market:'MATCH_WINNER' as const,line:null,outcome:'HOME' as const,receipt:'a'.repeat(650)+'.'+'b'.repeat(43)}))});
describe('bounded commercial offers with signed multi-leg selections',()=>{
 it.each([1,3,5,7,10])('keeps every %i-leg logo and visit context without exceeding the server body limit',legs=>{
  const pending=[context(legs),context(legs),context(legs,'logo'),context(legs,'logo')],sent:CommercialContext[]=[];
  while(pending.length){const count=offerBatchSize(pending);expect(count).toBeGreaterThan(0);const batch=pending.splice(0,count);
   expect(new TextEncoder().encode(JSON.stringify(batch)).byteLength).toBeLessThanOrEqual(16384);sent.push(...batch);}
  expect(sent).toHaveLength(4);expect(sent.every(c=>c.selections?.length===legs)).toBe(true);
 });
 it('retains the 16-context limit',()=>expect(offerBatchSize(Array.from({length:20},()=>context(0)))).toBe(16));
 it('counts UTF-8 bytes, not JavaScript characters',()=>{const large={...context(0),pagePath:'/'+ 'é'.repeat(8100)};expect(offerBatchSize([large,context(0)])).toBeLessThan(2);});
 it('rejects an individually oversized context',()=>expect(offerBatchSize([{...context(0),pagePath:'a'.repeat(17000)}])).toBe(0));
});
