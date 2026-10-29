import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {AutomationRepository} from './repository';
const mocks=vi.hoisted(()=>({generate:vi.fn(),snapshot:vi.fn(),collect:vi.fn()}));
vi.mock('./generation',()=>({generateBriefing:mocks.generate,modelPolicy:{timeoutMs:20000}}));
vi.mock('@/multisport/repository',()=>({SportsRepository:class{findPublished=mocks.snapshot;}}));
vi.mock('@/multisport/openligadb',()=>({assertOpenLigaSnapshot:vi.fn()}));
vi.mock('../discovery-collector',()=>({collectDiscovery:mocks.collect}));
vi.mock('./policy',()=>({automationLimits:{maxEventsPerRun:2,reserveMicroUsd:20000},eventKey:(f:{eventKey:string})=>f.eventKey,resultsFromSnapshot:()=>[],factErrors:()=>[],toNewsDraft:vi.fn(),automationSources:[{id:'nba-releases',requestLimit:3},{id:'nfl-cardinals',requestLimit:3},{id:'dimayor-releases',requestLimit:4}]}));
import {runNewsAutomation} from './runner';
beforeEach(()=>{vi.clearAllMocks();mocks.snapshot.mockResolvedValue({events:[],season:'synthetic'});});
describe('news scheduler failure reporting — no real model requests',()=>{
 function publishingRepo(){return {db:{},initialize:vi.fn(),beginValidatorRecovery:vi.fn().mockResolvedValue(null),finishValidatorRecovery:vi.fn().mockResolvedValue(false),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockResolvedValue(true),reconcile:vi.fn().mockResolvedValue(0),finishSource:vi.fn(),nextSourceDue:vi.fn().mockResolvedValue(null),dueSources:vi.fn().mockResolvedValue([]),eligiblePending:vi.fn().mockResolvedValue({eventKey:'synthetic',facts:{kind:'result'}}),publicationBlocker:vi.fn().mockResolvedValue(null),markAttempt:vi.fn(),fail:vi.fn(),finish:vi.fn(),publish:vi.fn()};}
 it('isolates a thrown collector while publishing another verified source',async()=>{
  const repo=publishingRepo();repo.dueSources.mockResolvedValue([{sourceId:'nfl-cardinals',cursor:{}}]);
  mocks.collect.mockRejectedValue(Error('private upstream details'));repo.publish.mockResolvedValue('verified-result');
  mocks.generate.mockResolvedValue({copy:{en:{},es:{},pt:{}},status:'VALIDATED',usage:{calls:3,inputTokens:20,outputTokens:10,microUsd:7}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:false});
  expect(result).toMatchObject({status:'completed',requests:3,published:['verified-result'],sourceOutcomes:expect.arrayContaining([{sourceId:'nfl-cardinals',status:'SOURCE_COLLECTOR_FAILED',requests:3}])});
  expect(JSON.stringify(result)).not.toContain('private upstream');
 });
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
  const repo={initialize:vi.fn(),beginValidatorRecovery:vi.fn().mockResolvedValue(null),finishValidatorRecovery:vi.fn().mockResolvedValue(false),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockImplementation(id=>id!=='openliga-results'),nextSourceDue:vi.fn().mockResolvedValue(null),dueSources:vi.fn().mockResolvedValue([{sourceId:'nfl-cardinals',cursor:{}},{sourceId:'dimayor-releases',cursor:{}}]),finishSource:vi.fn(),eligiblePending:vi.fn().mockResolvedValue(null),finish:vi.fn()};
  mocks.collect.mockResolvedValue({requests:3,status:'NO_CURRENT_VERIFIED_CANDIDATES',candidates:[]});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{validationOnly:true});
  expect(result.requests).toBe(3);expect(mocks.collect).toHaveBeenCalledTimes(1);expect(repo.finishSource).toHaveBeenCalledTimes(1);
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('registers new sources at the same clock used for the first discovery cycle',async()=>{
  const now=new Date('2026-10-22T08:00:00Z');
  const repo={initialize:vi.fn(),beginValidatorRecovery:vi.fn().mockResolvedValue(null),finishValidatorRecovery:vi.fn().mockResolvedValue(false),claim:vi.fn().mockResolvedValue({reason:'paused'})};
  await runNewsAutomation(repo as unknown as AutomationRepository,{validationOnly:true,now});
  expect(repo.initialize).toHaveBeenCalledWith(now);
  expect(repo.claim).toHaveBeenCalledWith(false,true,now);
 });
 it.each(['MODEL_RATE_LIMITED','MODEL_QUOTA_EXCEEDED','MODEL_LIMIT_UNCLASSIFIED','MODEL_UNAVAILABLE'])('marks %s failed in both result and durable run',async status=>{
  const repo={db:{},initialize:vi.fn(),beginValidatorRecovery:vi.fn().mockResolvedValue(null),finishValidatorRecovery:vi.fn().mockResolvedValue(false),claim:vi.fn().mockResolvedValue({id:'synthetic-run'}),sourceEnabled:vi.fn().mockResolvedValue(true),reconcile:vi.fn().mockResolvedValue(0),finishSource:vi.fn(),nextSourceDue:vi.fn().mockResolvedValue(null),dueSources:vi.fn().mockResolvedValue([]),eligiblePending:vi.fn().mockResolvedValue({eventKey:'synthetic',facts:{kind:'result'}}),publicationBlocker:vi.fn().mockResolvedValue(null),markAttempt:vi.fn(),fail:vi.fn(),finish:vi.fn(),publish:vi.fn()};
  mocks.generate.mockResolvedValue({copy:null,status,usage:{calls:1,inputTokens:0,outputTokens:0,microUsd:0}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:true});
  expect(result).toMatchObject({status:'failed',generation:status,published:[]});expect(repo.publish).not.toHaveBeenCalled();expect(mocks.generate).toHaveBeenCalledTimes(1);expect(repo.finish.mock.calls[0][3]).toBe('failed');
 });
 it('recovers only after a budgeted normal claim and sends fresh facts through the full generator',async()=>{
  const now=new Date('2026-10-28T18:43:32Z'),repo={...publishingRepo(),observe:vi.fn().mockResolvedValue('unchanged')};
  const facts={kind:'announcement',eventKey:'synthetic',sourceId:'nba-releases',sourceUrl:'https://pr.nba.com/synthetic',observedAt:now.toISOString()};
  const ticket={eventKey:'synthetic',correctionId:'nba-average-inflections-v1'};
  repo.beginValidatorRecovery.mockResolvedValue({ticket,source:{sourceId:'nba-releases',cursor:{}}});repo.finishValidatorRecovery.mockResolvedValue(true);
  repo.dueSources.mockResolvedValue([{sourceId:'dimayor-releases',cursor:{}}]);repo.eligiblePending.mockResolvedValue({eventKey:'synthetic',facts});repo.publish.mockResolvedValue('new-audited-article');
  mocks.collect.mockResolvedValue({requests:3,status:'CANDIDATES_VERIFIED',candidates:[{url:facts.sourceUrl}],announcements:[facts]});
  mocks.generate.mockResolvedValue({copy:{en:{},es:{},pt:{}},status:'VALIDATED',usage:{calls:3,inputTokens:20,outputTokens:10,microUsd:7}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:false,now});
  expect(repo.beginValidatorRecovery).toHaveBeenCalledWith('synthetic-run',now);expect(repo.finishValidatorRecovery).toHaveBeenCalledWith('synthetic-run',ticket,facts,now);
  expect(mocks.collect).toHaveBeenCalledTimes(1);expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.generate.mock.calls[0][0]).toBe(facts);expect(repo.markAttempt).toHaveBeenCalledExactlyOnceWith('synthetic-run','synthetic');
  expect(result).toMatchObject({requests:3,published:['new-audited-article'],validatorRecovery:{recovered:true,correctionId:ticket.correctionId}});
 });
 it.each(['paused','not-due','model-budget'])('does not inspect or recheck recovery before %s gate passes',async reason=>{
  const repo=publishingRepo();repo.claim.mockResolvedValue({reason});await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:false});expect(repo.beginValidatorRecovery).not.toHaveBeenCalled();expect(mocks.collect).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('records an exhausted recovery source check without blocking another verified story',async()=>{
  const repo=publishingRepo(),ticket={eventKey:'rejected-nba',correctionId:'nba-average-inflections-v1'};repo.beginValidatorRecovery.mockResolvedValue({ticket,source:{sourceId:'nba-releases',cursor:{}}});mocks.collect.mockRejectedValue(Error('upstream private detail'));repo.publish.mockResolvedValue('unaffected-story');mocks.generate.mockResolvedValue({copy:{en:{},es:{},pt:{}},status:'VALIDATED',usage:{calls:3,inputTokens:20,outputTokens:10,microUsd:7}});
  const result=await runNewsAutomation(repo as unknown as AutomationRepository,{key:'synthetic-token',validationOnly:false});expect(repo.finishValidatorRecovery).toHaveBeenCalledWith('synthetic-run',ticket,undefined,expect.any(Date));expect(result).toMatchObject({published:['unaffected-story'],validatorRecovery:{recovered:false}});expect(JSON.stringify(result)).not.toContain('upstream private detail');
 });

});
