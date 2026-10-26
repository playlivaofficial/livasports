import {describe,it,expect,vi} from 'vitest';
import {extractAnnouncement} from './announcements';
import {generationEligible,newerCorroboration} from './eligibility';
import {AutomationRepository,type AutomationEvent} from './repository';
import type {DatabaseClient} from '@/database/client';
import {fingerprint,stableFacts} from './policy';
const now=new Date('2026-10-26T12:00:00Z');
const facts=extractAnnouncement({desk:'nba-releases',url:'https://pr.nba.com/test-roster-announcement',sourceDate:'2026-10-25',headline:'NBA rosters feature 100 international players from 40 countries across six continents'},'100 international players from 40 countries across six continents are on opening-night rosters for the 2026-27 season',now)!;
describe('fresh primary evidence admission — synthetic facts, zero model calls',()=>{
 it('accepts freshly corroborated facts without changing story date',()=>{expect(generationEligible(facts,now)).toBe(true);expect(facts.eventDate).toBe('2026-10-25T00:00:00Z');});
 it('rejects stale evidence even inside the seven-day story window',()=>expect(generationEligible({...facts,observedAt:'2026-10-25T11:59:59Z'},now)).toBe(false));
 it('rejects future evidence and unverified provenance',()=>{expect(generationEligible({...facts,observedAt:'2026-10-27T00:00:00Z'},now)).toBe(false);expect(generationEligible({...facts,provenance:{...facts.provenance,factsHash:'invalid'}},now)).toBe(false);});
 it('never refreshes expired facts by changing only retrieval time',()=>expect(generationEligible({...facts,eventDate:'2026-10-01T00:00:00Z'},now)).toBe(false));
 it('requires a newer valid full fact observation',()=>{expect(newerCorroboration({...facts,observedAt:'2026-10-25T12:00:00Z'},facts,now)).toBe(true);expect(newerCorroboration(facts,facts,now)).toBe(false);expect(newerCorroboration(facts,{...facts,observedAt:'2026-10-27T00:00:00Z'},now)).toBe(false);});
 it('does not let stale queued facts starve a fresh eligible event',async()=>{
  const stale={eventKey:'stale',facts:{...facts,observedAt:'2026-10-25T11:59:59Z'}},fresh={eventKey:'fresh',facts};
  const query=vi.fn().mockResolvedValue({rows:[stale,fresh]});const repo=new AutomationRepository({query} as unknown as DatabaseClient);
  expect((await repo.eligiblePending(now,false))?.eventKey).toBe('fresh');expect(query.mock.calls[0][1]).toEqual([500]);
 });
 it('leaves an entirely stale queue private without selecting a model job',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{facts:{...facts,observedAt:'2026-10-25T11:59:59Z'}}] as AutomationEvent[]});
  expect(await new AutomationRepository({query} as unknown as DatabaseClient).eligiblePending(now)).toBeNull();
 });
 it('blocks a protected archived Owner source record before generation',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{slug:'synthetic-owner-record',archived:true,revision:4,published:{},draft:{}}]});
  expect(await new AutomationRepository({query} as unknown as DatabaseClient).publicationBlocker({facts} as AutomationEvent)).toBe('OWNER_OR_DUPLICATE_RECORD');
  expect(query.mock.calls[0][0]).not.toMatch(/UPDATE|INSERT|DELETE|FOR UPDATE/);
 });
 it('allows a source with no duplicate record, retaining the later atomic check',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[]});expect(await new AutomationRepository({query} as unknown as DatabaseClient).publicationBlocker({facts} as AutomationEvent)).toBeNull();
 });
 it('refreshes identical corroborated facts without a new revision, attempt or publication',async()=>{
  const old={facts:{...facts,observedAt:'2026-10-25T12:00:00Z'},fingerprint:fingerprint(stableFacts(facts)),state:'published',attempts:1};
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('SELECT r.id')?[{id:'synthetic'}]:sql.includes('SELECT disabled')?[{disabled:false}]:sql.includes('SELECT event_key')?[old]:[]}));
  const db={query,transaction:async<T>(work:(value:unknown)=>Promise<T>)=>work({query})};
  expect(await new AutomationRepository(db as unknown as DatabaseClient).observe('synthetic',facts,now)).toBe('unchanged');
  const mutations=query.mock.calls.filter(([sql])=>/UPDATE|INSERT|DELETE/.test(sql)&&!sql.includes('FOR UPDATE'));
  expect(mutations).toHaveLength(1);expect(mutations[0][0]).toBe('UPDATE editorial_automation_events SET facts=$2 WHERE event_key=$1');
 });
});
