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
 function publishingRepo(){return {db:{},initialize:vi.fn(),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockResolvedValue(true),reconcile:vi.fn().mockResolvedValue(0),finishSource:vi.fn(),dueSources:vi.fn().mockResolvedValue([]),eligiblePending:vi.fn().mockResolvedValue({eventKey:'synthetic',facts:{kind:'result'}}),publicationBlocker:vi.fn().mockResolvedValue(null),markAttempt:vi.fn(),fail:vi.fn(),finish:vi.fn(),publish:vi.fn()};}
 it.each([false,true])('restores canary pause after normal completion or caught failure: %s',async fail=>{
  const repo={...publishingRepo(),canary:{id:'synthetic-canary'},control:vi.fn()};
  repo.eligiblePending.mockResolvedValue(null);if(fail)repo.dueSources.mockRejectedValue(Error('synthetic failure'));
  await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:true});
  expect(repo.control).toHaveBeenCalledExactlyOnceWith({paused:true});expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('keeps ordinary recurring publication active after an audited success',async()=>{
  const repo={...publishingRepo(),control:vi.fn()};repo.publish.mockResolvedValue('synthetic-approved-story');
  mocks.generate.mockResolvedValue({copy:{en:{},es:{},pt:{}},status:'VALIDATED',usage:{calls:3,inputTokens:20,outputTokens:10,microUsd:7}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:false});
  expect(result.published).toEqual(['synthetic-approved-story']);expect(repo.control).not.toHaveBeenCalled();expect(repo.finish).toHaveBeenCalled();
 });
 it('does not spend tokens or increment attempts for an existing Owner/duplicate record',async()=>{
  const repo=publishingRepo();repo.publicationBlocker.mockResolvedValue('OWNER_OR_DUPLICATE_RECORD');
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:true});
  expect(result).toMatchObject({generation:'OWNER_OR_DUPLICATE_RECORD',published:[]});expect(mocks.generate).not.toHaveBeenCalled();expect(repo.markAttempt).not.toHaveBeenCalled();expect(repo.fail).toHaveBeenCalledWith('synthetic','OWNER_OR_DUPLICATE_RECORD');
 });
 it.each(['paused','not-due','model-budget','discovery-budget'])('a durable %s rejection performs no source or model work',async reason=>{
  const repo=publishingRepo();repo.claim.mockResolvedValue({reason});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:true});
  expect(result).toEqual({status:reason,requests:0,published:[],changed:false});
  expect(mocks.snapshot).not.toHaveBeenCalled();expect(mocks.collect).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();expect(repo.finish).not.toHaveBeenCalled();
 });
 it('a snapshot storage failure cannot retract an existing publication',async()=>{
  const repo=publishingRepo();repo.eligiblePending.mockResolvedValue(null);mocks.snapshot.mockRejectedValue(Error('synthetic-storage-failure'));
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{validationOnly:true});
  expect(repo.reconcile).not.toHaveBeenCalled();expect(repo.finishSource).toHaveBeenCalledWith('synthetic-run','openliga-results','RESULT_VALIDATION_FAILED',0,{},expect.any(Date));
  expect(result).toMatchObject({changed:false,withdrawn:0,published:[]});expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('a failed source discovery records backoff without declaring old stories withdrawn',async()=>{
  const repo=publishingRepo();repo.sourceEnabled.mockImplementation(id=>Promise.resolve(id!=='openliga-results'));repo.eligiblePending.mockResolvedValue(null);repo.dueSources.mockResolvedValue([{sourceId:'nfl-cardinals',cursor:{}}]);
  mocks.collect.mockResolvedValue({requests:1,status:'SOURCE_HTTP_503',candidates:[]});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{validationOnly:true});
  expect(repo.finishSource).toHaveBeenCalledWith('synthetic-run','nfl-cardinals','SOURCE_HTTP_503',1,{},expect.any(Date));
  expect(repo.reconcile).not.toHaveBeenCalled();expect(result).toMatchObject({changed:false,withdrawn:0,published:[]});expect(mocks.generate).not.toHaveBeenCalled();
 });
 it.each(['OWNER_OR_DUPLICATE_RECORD','SOURCE_CHANGED_DURING_GENERATION','sensitive SQL token=never-emit'])('retains only sanitized post-audit failure categories: %s',async error=>{
  const repo=publishingRepo();repo.publish.mockRejectedValue(Error(error));mocks.generate.mockResolvedValue({copy:{en:{},es:{},pt:{}},status:'VALIDATED',usage:{calls:3,inputTokens:20,outputTokens:10,microUsd:7}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:true});
  const safe=error.startsWith('sensitive')?'PUBLICATION_STORAGE_UNAVAILABLE':error;
  expect(result).toMatchObject({status:'failed',generation:safe,published:[]});expect(repo.fail).toHaveBeenCalledWith('synthetic',safe);expect(JSON.stringify(repo.finish.mock.calls)).not.toContain('never-emit');expect(repo.finish.mock.calls[0][2]).toMatchObject({calls:3,microUsd:7});
 });
 it('defers a second source when its worst-case reads exceed the remaining durable reservation',async()=>{
  const repo={initialize:vi.fn(),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockImplementation(id=>id!=='openliga-results'),dueSources:vi.fn().mockResolvedValue([{sourceId:'nfl-cardinals',cursor:{}},{sourceId:'dimayor-releases',cursor:{}}]),finishSource:vi.fn(),eligiblePending:vi.fn().mockResolvedValue(null),finish:vi.fn()};
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
  const repo={db:{},initialize:vi.fn(),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockResolvedValue(true),reconcile:vi.fn().mockResolvedValue(0),finishSource:vi.fn(),dueSources:vi.fn().mockResolvedValue([]),eligiblePending:vi.fn().mockResolvedValue({eventKey:'synthetic',facts:{kind:'result'}}),publicationBlocker:vi.fn().mockResolvedValue(null),markAttempt:vi.fn(),fail:vi.fn(),finish:vi.fn(),publish:vi.fn()};
  mocks.generate.mockResolvedValue({copy:null,status,usage:{calls:1,inputTokens:0,outputTokens:0,microUsd:0}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:true});
  expect(result).toMatchObject({status:'failed',generation:status,published:[]});expect(repo.publish).not.toHaveBeenCalled();expect(mocks.generate).toHaveBeenCalledTimes(1);expect(repo.finish.mock.calls[0][3]).toBe('failed');
 });
});
