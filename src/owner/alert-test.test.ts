import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {sendOwnerAlertTest} from './alert-test';
const id='00000000-0000-4000-8000-000000000001';
function database(){
  const rows=new Map<string,string>();
  const query=vi.fn(async(sql:string,args:readonly unknown[]=[])=>{
    if(sql.includes('SELECT status'))return {rows:rows.has(String(args[1]))?[{status:rows.get(String(args[1]))}]:[],rowCount:rows.has(String(args[1]))?1:0};
    if(sql.includes("phase='OPENED' AND status='SENT'"))return {rows:[],rowCount:rows.get('OPENED')==='SENT'?1:0};
    if(sql.includes('INSERT INTO owner_alert_tests'))rows.set(String(args[1]),'PENDING');
    if(sql.includes('UPDATE owner_alert_tests'))rows.set(String(args[1]),String(args[2]));
    return {rows:[],rowCount:0};
  });
  const typed=query as unknown as QueryExecutor['query'];
  return {db:{query:typed,transaction:async work=>work({query:typed}),close:async()=>{}} as DatabaseClient,rows,query};
}
describe('safe internal owner alert drill',()=>{
  it('sends an explicit test, deduplicates its replay and sends one resolution',async()=>{
    const {db}=database();const transport=vi.fn(async()=>{});const options={transport,to:'owner@example.test'};
    expect((await sendOwnerAlertTest(db,id,'OPENED',options)).code).toBe('SENT');
    expect((await sendOwnerAlertTest(db,id,'OPENED',options)).code).toBe('ALREADY_SENT');
    expect((await sendOwnerAlertTest(db,id,'RESOLVED',options)).code).toBe('SENT');
    expect((await sendOwnerAlertTest(db,id,'RESOLVED',options)).code).toBe('ALREADY_SENT');
    expect(transport).toHaveBeenCalledTimes(2);expect(JSON.stringify(transport.mock.calls)).toContain('not a real odds outage');
  });
  it('requires delivery of the opening test first and never exposes SMTP failures',async()=>{
    const {db}=database();const transport=vi.fn(async()=>{throw new Error('private SMTP secret');});const options={transport,to:'owner@example.test'};
    expect((await sendOwnerAlertTest(db,id,'RESOLVED',options)).code).toBe('OPEN_REQUIRED');
    expect(await sendOwnerAlertTest(db,id,'OPENED',options)).toEqual({ok:false,code:'SEND_FAILED',providerRequests:0});
    expect((await sendOwnerAlertTest(db,id,'OPENED',options)).code).toBe('FAILED');expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not resend a pending delivery after a process interruption',async()=>{
    const {db,rows}=database();rows.set('OPENED','PENDING');const transport=vi.fn(async()=>{});
    expect((await sendOwnerAlertTest(db,id,'OPENED',{transport,to:'owner@example.test'})).code).toBe('PENDING');
    expect(transport).not.toHaveBeenCalled();
  });
});
