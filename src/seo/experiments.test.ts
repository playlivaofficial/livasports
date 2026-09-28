import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import type {QueryExecutor} from '@/database/client';
import {registerExperiment,activateExperiment,captureExperimentObservations,type ExperimentRegistration} from './experiments';
const measurement={from:'2026-09-01',to:'2026-09-07',totals:{clicks:0,impressions:100,ctr:0,position:10},brazil:null,mobile:null,topQueries:[],countries:[],devices:[],complete:true,breakdownsComplete:true};
const input:ExperimentRegistration={key:'ctr-v1',page:'https://livasports.com/br/jogo/a-b-id',locale:'br',queryCluster:'a b',reason:'Observed impressions',oldTitle:'Old',oldDescription:'Old description',newTitle:'New',newDescription:'New description',baseline:{'7':measurement,'14':measurement,'28':measurement}};
function database(){const query=vi.fn< (sql:string,values?:readonly unknown[])=>Promise<{rows:never[];rowCount:number}> >(async()=>({rows:[],rowCount:0}));return {query,db:{query} as unknown as QueryExecutor};}
describe('owner metadata experiment persistence',()=>{
  it('freezes the baseline with conflict DO NOTHING, not an overwrite',async()=>{
    const {db,query}=database();await registerExperiment(db,input);
    expect(query.mock.calls[0]?.[0]).toContain('ON CONFLICT(experiment_key,page) DO NOTHING');
  });
  it('does not register absent/partial GSC baseline or an external URL',async()=>{
    const {db,query}=database();
    await expect(registerExperiment(db,{...input,baseline:{...input.baseline,'7':{...measurement,complete:false}}})).rejects.toThrow('BASELINE_INCOMPLETE');
    await expect(registerExperiment(db,{...input,page:'https://example.com/br/'})).rejects.toThrow('INVALID_EXPERIMENT_PAGE');
    expect(query).not.toHaveBeenCalled();
  });
  it('activates once after release, never shifting changed_at on repeat',async()=>{
    const {db,query}=database();await activateExperiment(db,'id','a'.repeat(40),new Date('2026-09-28T20:00:00Z'));
    expect(query.mock.calls[0]?.[0]).toContain('AND changed_at IS NULL');
  });
  it('makes no provider requests and writes no metrics before an observation is mature',async()=>{
    const query=vi.fn(async()=>({rows:[{id:'id',property:'sc-domain:livasports.com',page:input.page,observation_start:'2026-09-29'}]}));
    expect(await captureExperimentObservations({query} as unknown as QueryExecutor,new Date('2026-09-30'))).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
