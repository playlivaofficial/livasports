import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {AutomationRepository} from './repository';
const mocks=vi.hoisted(()=>({generate:vi.fn(),snapshot:vi.fn(),collect:vi.fn()}));
vi.mock('./generation',()=>({generateBriefing:mocks.generate}));
vi.mock('@/multisport/repository',()=>({SportsRepository:class{findPublished=mocks.snapshot;}}));
vi.mock('@/multisport/openligadb',()=>({assertOpenLigaSnapshot:vi.fn()}));
vi.mock('../discovery-collector',()=>({collectDiscovery:mocks.collect}));
vi.mock('./policy',()=>({resultsFromSnapshot:()=>[],factErrors:()=>[],toNewsDraft:vi.fn(),automationSources:[{id:'nfl-cardinals',requestLimit:3},{id:'dimayor-releases',requestLimit:2}]}));
import {runNewsAutomation} from './runner';
beforeEach(()=>{vi.clearAllMocks();mocks.snapshot.mockResolvedValue({events:[],season:'synthetic'});});
describe('news scheduler failure reporting — no real model requests',()=>{
 it('defers a second source when its worst-case reads exceed the remaining durable reservation',async()=>{
  const repo={initialize:vi.fn(),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockImplementation(id=>id!=='openliga-results'),dueSources:vi.fn().mockResolvedValue([{sourceId:'nfl-cardinals',cursor:{}},{sourceId:'dimayor-releases',cursor:{}}]),finishSource:vi.fn(),pending:vi.fn().mockResolvedValue(null),finish:vi.fn()};
  mocks.collect.mockResolvedValue({requests:3,status:'NO_CURRENT_VERIFIED_CANDIDATES',candidates:[]});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{validationOnly:true});
  expect(result.requests).toBe(3);expect(mocks.collect).toHaveBeenCalledTimes(1);expect(repo.finishSource).toHaveBeenCalledTimes(1);
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('registers new sources at the same clock used for the first discovery cycle',async()=>{
  const now=new Date('2026-10-22T08:00:00Z');
  const repo={initialize:vi.fn(),claim:vi.fn().mockResolvedValue({reason:'paused'})};
  await runNewsAutomation(repo as unknown as AutomationRepository,{validationOnly:true,now});
  expect(repo.initialize).toHaveBeenCalledWith(now);
  expect(repo.claim).toHaveBeenCalledWith(false,true,now);
 });
 it.each(['MODEL_RATE_LIMITED','MODEL_QUOTA_EXCEEDED','MODEL_LIMIT_UNCLASSIFIED','MODEL_UNAVAILABLE'])('marks %s failed in both result and durable run',async status=>{
  const repo={db:{},initialize:vi.fn(),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockResolvedValue(true),reconcile:vi.fn().mockResolvedValue(0),finishSource:vi.fn(),dueSources:vi.fn().mockResolvedValue([]),pending:vi.fn().mockResolvedValue({eventKey:'synthetic',facts:{kind:'result'}}),markAttempt:vi.fn(),fail:vi.fn(),finish:vi.fn(),publish:vi.fn()};
  mocks.generate.mockResolvedValue({copy:null,status,usage:{calls:1,inputTokens:0,outputTokens:0,microUsd:0}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:true});
  expect(result).toMatchObject({status:'failed',generation:status,published:[]});expect(repo.publish).not.toHaveBeenCalled();expect(mocks.generate).toHaveBeenCalledTimes(1);expect(repo.finish.mock.calls[0][3]).toBe('failed');
 });
});
