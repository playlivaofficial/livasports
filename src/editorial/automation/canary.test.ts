import {describe,it,expect} from 'vitest';
import {parseCanary,canaryMatches} from './canary';
import {eventKey,fingerprint,stableFacts,type ResultFacts} from './policy';
const facts:ResultFacts={kind:'result',sourceId:'openliga-results',sourceUrl:'https://api.openligadb.de/getmatchdata/123',competition:'bundesliga',season:'2026/27',eventId:'openligadb-match-123',eventKey:'bundesliga:2026/27:openligadb-match-123',observedAt:'2026-10-27T10:00:00Z',eventDate:'2026-10-25T10:00:00Z',home:{id:'home',name:'Synthetic Home'},away:{id:'away',name:'Synthetic Away'},homeScore:1,awayScore:3,status:'completed',sourceSnapshotHash:'synthetic'};
const scope={id:'synthetic-grant-1',sourceId:'openliga-results',eventKey:eventKey(facts),fingerprint:fingerprint(stableFacts(facts)),notBefore:'2026-10-27T11:00:00Z',expiresAt:'2026-10-27T12:00:00Z',priorReservedMicroUsd:180000};
describe('explicit one-event authorization',()=>{
 it('preserves existing behavior when absent and rejects blank/malformed/partial config',()=>{
  expect(parseCanary(undefined)).toBeUndefined();
  for(const raw of ['', '{}', 'null', JSON.stringify({...scope,extra:true}),JSON.stringify({...scope,sourceId:'wikinews-football'}),JSON.stringify({...scope,expiresAt:'never'})])expect(()=>parseCanary(raw)).toThrow('INVALID_CANARY_SCOPE');
 });
 it('binds exact source, event and facts while allowing a fresh observation of identical facts',()=>{
  const parsed=parseCanary(JSON.stringify(scope))!;expect(canaryMatches(parsed,facts)).toBe(true);
  expect(canaryMatches(parsed,{...facts,observedAt:'2026-10-27T11:00:00Z'})).toBe(true);
  expect(canaryMatches(parsed,{...facts,awayScore:4})).toBe(false);
  expect(canaryMatches(parsed,{...facts,eventKey:'bundesliga:2026/27:openligadb-match-124'})).toBe(false);
 });
});
