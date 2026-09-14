import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SportsAuditProvider,SportsProviderError} from './provider-audit';
import type {QueryExecutor} from '@/database/client';

describe('sports backend provider audit',()=>{
  it('records official per-entity limits without storing the rest of a private response envelope',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'liva-sports-quota-'));
    const db={query:vi.fn(async()=>({rows:[]}))} as unknown as QueryExecutor;
    const transport=vi.fn(async()=>Response.json({data:[],rate_limit:{requested_entity:'Fixture',remaining:2499,resets_in_seconds:3500},privateAccount:'must not retain'},{headers:{'x-ratelimit-limit':'2500'}}));
    try{const api=new SportsAuditProvider('test',db,'run',directory,transport);const response=await api.page('football/fixtures');
      expect(response.rateLimit).toMatchObject({entity:'Fixture',remaining:2499,hardLimit:2500});expect(api.rateLimits()).toHaveLength(1);expect(JSON.stringify(response)).not.toContain('privateAccount');
    }finally{await rm(directory,{recursive:true,force:true});}
  });
  it('does not send another request when the official entity window is exhausted',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'liva-sports-limit-'));
    const db={query:vi.fn(async()=>({rows:[]}))} as unknown as QueryExecutor;
    const transport=vi.fn(async()=>Response.json({data:[],rate_limit:{requested_entity:'Fixture',remaining:0,resets_in_seconds:100}}));
    try{const api=new SportsAuditProvider('test',db,'run',directory,transport);await api.page('football/fixtures');
      await expect(api.page('football/fixtures',{page:'2'})).rejects.toEqual(new SportsProviderError(429));expect(api.requests).toBe(1);
      await api.page('football/fixtures');expect(api.requests).toBe(1);
    }finally{await rm(directory,{recursive:true,force:true});}
  });
  it('counts HTTP attempts durably and resumes identical pages from cache',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'liva-sports-audit-'));
    const order:string[]=[];
    const db={query:vi.fn(async()=>{order.push('ledger');return {rows:[],rowCount:1};})} as unknown as QueryExecutor;
    const transport=vi.fn(async()=>{order.push('http');return Response.json({data:[{id:1}],pagination:{has_more:false}});});
    try{const api=new SportsAuditProvider('test-credential',db,'run',directory,transport);
      expect((await api.page('football/seasons')).data).toEqual([{id:1}]);
      await api.page('football/seasons');expect(api.requests).toBe(1);expect(order).toEqual(['ledger','http']);
      expect(transport.mock.calls.length).toBe(1);
    }finally{await rm(directory,{recursive:true,force:true});}
  });
  it('exhausts actual pagination and detects a repeated page',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'liva-sports-pages-'));
    const db={query:vi.fn(async()=>({rows:[]}))} as unknown as QueryExecutor;
    const transport=vi.fn(async()=>Response.json({data:[{id:1}],pagination:{has_more:true}}));
    try{const api=new SportsAuditProvider('test-credential',db,'run',directory,transport);
      await expect(api.all('football/seasons')).rejects.toThrow('pagination did not advance');expect(api.requests).toBe(2);
    }finally{await rm(directory,{recursive:true,force:true});}
  });
  it('an explicit current-season refresh bypasses cached responses and still counts every HTTP attempt',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'liva-sports-refresh-'));
    const db={query:vi.fn(async()=>({rows:[]}))} as unknown as QueryExecutor;
    let count=0;const transport=vi.fn(async()=>Response.json({data:[{id:++count}],pagination:{has_more:false}}));
    try{
      await new SportsAuditProvider('test-credential',db,'run',directory,transport).all('football/seasons');
      const fresh=new SportsAuditProvider('test-credential',db,'run',directory,transport,{refresh:true});
      expect((await fresh.all('football/seasons')).data).toEqual([{id:2}]);expect(fresh.requests).toBe(1);
    }finally{await rm(directory,{recursive:true,force:true});}
  });
  it('stops on rate limits without serializing private provider errors',async()=>{
    const db={query:vi.fn(async()=>({rows:[]}))} as unknown as QueryExecutor;
    const transport=vi.fn(async()=>Response.json({message:'private response'},{status:429}));
    const api=new SportsAuditProvider('test-credential',db,'run','unused',transport);
    await expect(api.page('football/seasons',{},true)).rejects.toEqual(new SportsProviderError(429));
    await expect(api.page('football/teams',{},true)).rejects.toEqual(new SportsProviderError(429));
    expect(api.requests).toBe(1);
  });
  it('cannot mistake a failed later page for complete provider absence',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'liva-sports-partial-'));
    const db={query:vi.fn(async()=>({rows:[]}))} as unknown as QueryExecutor;
    let count=0;const transport=vi.fn(async()=>++count===1?Response.json({data:[{id:1}],pagination:{has_more:true}}):Response.json({message:'private'},{status:403}));
    try{await expect(new SportsAuditProvider('test-credential',db,'run',directory,transport).all('football/seasons')).rejects.toEqual(new SportsProviderError(403));}
    finally{await rm(directory,{recursive:true,force:true});}
  });
  it('cannot request commercial endpoints or send credentials in query parameters',async()=>{
    const db={query:vi.fn()} as unknown as QueryExecutor;
    const transport=vi.fn();const api=new SportsAuditProvider('test-credential',db,'run','unused',transport);
    await expect(api.page('football/odds')).rejects.toThrow('Unsupported');
    await expect(api.page('football/fixtures',{include:'odds'})).rejects.toThrow('Unsupported');
    await expect(api.page('football/fixtures',{api_token:'test'})).rejects.toThrow('Unsupported');
    expect(transport).not.toHaveBeenCalled();
  });
});
