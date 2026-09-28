import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import type {QueryExecutor} from '@/database/client';
import {ingestPageBreakdowns,measurePage} from './page-breakdowns';
const page='https://livasports.com/br/jogo/a-x-b';
describe('page-level GSC evidence',()=>{
  it('requests actual page/dimension associations and keeps authentication out of persisted records',async()=>{
    const requests:unknown[]=[];
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({rows:[{keys:['2026-09-25',page,'bra'],clicks:1,impressions:10,ctr:0.1,position:8}]});
    }) as unknown as typeof fetch;
    const query=vi.fn< (sql:string,values?:readonly unknown[])=>Promise<{rows:never[];rowCount:number}> >(async()=>({rows:[],rowCount:0}));
    const result=await ingestPageBreakdowns({query} as unknown as QueryExecutor,'test-token','sc-domain:livasports.com','2026-09-19','2026-09-25',fetcher);
    expect(requests).toEqual(expect.arrayContaining([expect.objectContaining({dimensions:['date','page','query'],dataState:'final'}),expect.objectContaining({dimensions:['date','page','country']}),expect.objectContaining({dimensions:['date','page','device']})]));
    expect(result.every(r=>r.state==='SUCCEEDED')).toBe(true);
    expect(JSON.stringify(query.mock.calls)).not.toContain('test-token');
    expect(query.mock.calls.find(c=>c[0].includes('INSERT INTO seo_page_breakdowns'))?.[0]).toContain('ON CONFLICT');
  });
  it('stops on denied auth, preserves stored data and records a sanitized failure',async()=>{
    const query=vi.fn< (sql:string,values?:readonly unknown[])=>Promise<{rows:never[];rowCount:number}> >(async()=>({rows:[],rowCount:0}));
    const fetcher=vi.fn(async()=>Response.json({secret:'never persisted'},{status:403})) as unknown as typeof fetch;
    await ingestPageBreakdowns({query} as unknown as QueryExecutor,'token','property','2026-09-19','2026-09-25',fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.every(c=>!c[0].includes('DELETE'))).toBe(true);
    expect(JSON.stringify(query.mock.calls)).toContain('PROPERTY_DENIED');
    expect(JSON.stringify(query.mock.calls)).not.toContain('never persisted');
  });
  it('retains previous measurements when Google caps or fails a report, without retries',async()=>{
    const query=vi.fn<(sql:string,values?:readonly unknown[])=>Promise<{rows:never[];rowCount:number}>>(async()=>({rows:[],rowCount:0}));
    const row={keys:['2026-09-25',page,'query'],clicks:0,impressions:1,ctr:0,position:10};
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({rows:Array.from({length:25000},()=>row)}))
      .mockResolvedValueOnce(Response.json({}, {status:500})).mockResolvedValueOnce(Response.json({rows:[]}));
    const result=await ingestPageBreakdowns({query} as unknown as QueryExecutor,'test-only','property','2026-09-19','2026-09-25',fetcher);
    expect(result.map(r=>r.state)).toEqual(['TRUNCATED','FAILED','SUCCEEDED']);expect(fetcher).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.filter(c=>String(c[0]).includes('DELETE'))).toHaveLength(1);
  });
  it('does not infer a top query/country/device from unrelated site totals',async()=>{
    const query=vi.fn(async()=>({rows:[]}));
    const result=await measurePage({query} as unknown as QueryExecutor,'property',page,'2026-09-19','2026-09-25');
    expect(result).toMatchObject({complete:false,breakdownsComplete:false,totals:null,brazil:null,mobile:null,topQueries:[]});
  });
  it('uses independent page totals despite suppressed query rows',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.includes('seo_gsc_syncs')?[{state:'CONNECTED',truncated:false}]
      :sql.includes('seo_breakdown_syncs')?['QUERY','COUNTRY','DEVICE'].map(dimension=>({dimension,state:'SUCCEEDED'}))
      :sql.includes('seo_search_daily')?[{key:page,clicks:4,impressions:100,ctr:.04,position:8}]
      :[{dimension:'QUERY',key:'match',clicks:1,impressions:20,ctr:.05,position:10},
        {dimension:'COUNTRY',key:'bra',clicks:2,impressions:50,ctr:.04,position:9},
        {dimension:'DEVICE',key:'MOBILE',clicks:3,impressions:80,ctr:.0375,position:7}]}));
    const result=await measurePage({query} as unknown as QueryExecutor,'property',page,'2026-09-19','2026-09-25');
    expect(result.totals?.impressions).toBe(100);expect(result.topQueries[0]?.impressions).toBe(20);
    expect(result.brazil?.impressions).toBe(50);expect(result.mobile?.impressions).toBe(80);
  });
});
