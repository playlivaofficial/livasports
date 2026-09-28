import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {generateKeyPairSync} from 'node:crypto';
import type {QueryExecutor} from '@/database/client';
import {GSC_FINAL_LAG_DAYS,gscWindows,ingestGscSearchAnalytics} from './gsc-ingest';

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const SERVICE=JSON.stringify({client_email:'a@b.iam',private_key:privateKey});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const NOW=new Date('2026-09-26T12:00:00Z');

function db(){
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
    calls.push({sql,params});
    if(sql.includes('INSERT INTO seo_gsc_syncs'))return {rows:[{id:'sync-1'}],rowCount:1};
    return {rows:[],rowCount:0};
  });
  return {db:{query:query as unknown as QueryExecutor['query']},calls};
}

describe('complete-day comparison windows',()=>{
  it('never includes today or Google\'s still-settling days',()=>{
    const w=gscWindows(NOW);
    expect(w.latestComplete).toBe('2026-09-23');           // 26th minus the 3-day finalisation lag
    expect(w.current7).toEqual({from:'2026-09-17',to:'2026-09-23',days:7});
    expect(w.previous7).toEqual({from:'2026-09-10',to:'2026-09-16',days:7});
    expect(new Date(w.current7.to)<NOW).toBe(true);
  });
  it('compares equal-length, non-overlapping windows',()=>{
    const w=gscWindows(NOW);
    for(const [current,previous] of [[w.current7,w.previous7],[w.current28,w.previous28]] as const){
      expect(current.days).toBe(previous.days);
      expect(new Date(previous.to)<new Date(current.from)).toBe(true);
    }
    expect(w.current28.days).toBe(28);
    expect(GSC_FINAL_LAG_DAYS).toBeGreaterThan(0);
  });
});

describe('ingestion',()=>{
  it('atomically clears only revised-away rows in a successful report window, even when empty',async()=>{
    const fetcher=vi.fn(async(url:string)=>url.includes('oauth2')?json({access_token:'tok'}):url.includes('searchAnalytics')?json({rows:[]}):json({sitemap:[]})) as unknown as typeof fetch;
    const {db:client,calls}=db();
    await ingestGscSearchAnalytics(client,{now:NOW,env:{GSC_SERVICE_ACCOUNT_JSON:SERVICE},fetcher,dimensions:['PAGE']});
    const statement=calls.find(c=>c.sql.includes('INSERT INTO seo_search_daily'))!;
    expect(statement.sql).toContain('DELETE FROM seo_search_daily');
    expect(statement.sql).toContain('property=$1 AND dimension=$2 AND day BETWEEN $4::date AND $5::date');
    expect(statement.sql).toContain('NOT EXISTS');expect(statement.params.slice(1)).toEqual(['PAGE','[]','2026-08-27','2026-09-23']);
  });
  it('stays NOT_CONNECTED and touches no table when no credential exists',async()=>{
    const {db:client,calls}=db();
    const result=await ingestGscSearchAnalytics(client,{now:NOW,env:{}});
    expect(result.state).toBe('NOT_CONNECTED');
    expect(result.rows).toBe(0);
    expect(calls).toHaveLength(0);
  });
  it('upserts per day so a repeated run updates instead of duplicating',async()=>{
    const fetcher=vi.fn(async(url:string)=>url.includes('oauth2')?json({access_token:'tok'})
      :url.includes('searchAnalytics')?json({rows:[{keys:['2026-09-20'],clicks:3,impressions:100,ctr:0.03,position:11}]})
      :json({sitemap:[]})) as unknown as typeof fetch;
    const {db:client,calls}=db();
    const result=await ingestGscSearchAnalytics(client,{now:NOW,env:{GSC_SERVICE_ACCOUNT_JSON:SERVICE},
      fetcher,dimensions:['TOTAL']});
    expect(result).toMatchObject({state:'CONNECTED',days:1,rows:1,truncated:false});
    const insert=calls.find(c=>c.sql.includes('INSERT INTO seo_search_daily'))!;
    expect(insert.sql).toContain('ON CONFLICT(property,day,dimension,key) DO UPDATE');
    expect(JSON.parse(String(insert.params[2]))).toEqual([{day:'2026-09-20',key:'',clicks:3,impressions:100,ctr:0.03,position:11}]);
  });
  it('records the sync outcome so an outage is visible as an outage, not as zero data',async()=>{
    const fetcher=vi.fn(async(url:string)=>url.includes('oauth2')?json({access_token:'tok'}):json({},403)) as unknown as typeof fetch;
    const {db:client,calls}=db();
    const result=await ingestGscSearchAnalytics(client,{now:NOW,env:{GSC_SERVICE_ACCOUNT_JSON:SERVICE},fetcher});
    expect(result.state).toBe('PROPERTY_DENIED');
    expect(result.rows).toBe(0);
    const finished=calls.find(c=>c.sql.includes('UPDATE seo_gsc_syncs'))!;
    expect(finished.params[1]).toBe('PROPERTY_DENIED');
    expect(finished.params[5]).toBeTruthy();
  });
  it('keeps a good performance ingest when only the sitemap call fails',async()=>{
    const fetcher=vi.fn(async(url:string)=>url.includes('oauth2')?json({access_token:'tok'})
      :url.includes('searchAnalytics')?json({rows:[{keys:['2026-09-20'],clicks:1,impressions:5,ctr:0.2,position:9}]})
      :json({},500)) as unknown as typeof fetch;
    const {db:client}=db();
    const result=await ingestGscSearchAnalytics(client,{now:NOW,env:{GSC_SERVICE_ACCOUNT_JSON:SERVICE},
      fetcher,dimensions:['TOTAL']});
    expect(result.state).toBe('CONNECTED');
    expect(result.rows).toBe(1);
    expect(result.sitemaps).toBe(0);
  });
  it('ignores malformed rows rather than storing a bad date',async()=>{
    const fetcher=vi.fn(async(url:string)=>url.includes('oauth2')?json({access_token:'tok'})
      :url.includes('searchAnalytics')?json({rows:[{keys:['not-a-date'],clicks:1,impressions:1,ctr:1,position:1}]})
      :json({sitemap:[]})) as unknown as typeof fetch;
    const {db:client,calls}=db();
    const result=await ingestGscSearchAnalytics(client,{now:NOW,env:{GSC_SERVICE_ACCOUNT_JSON:SERVICE},
      fetcher,dimensions:['TOTAL']});
    expect(result.rows).toBe(0);
    expect(calls.some(c=>c.sql.includes('INSERT INTO seo_search_daily'))).toBe(false);
  });
});
