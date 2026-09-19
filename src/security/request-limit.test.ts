import {afterEach,describe,expect,it,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
vi.mock('server-only',()=>({}));
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/database/client',()=>({databaseUrl:()=>'test-db',PostgresDatabaseClient:class{query=query;}}));
import {consumeRequestLimit,requestBucket,requestLimit,withRequestLimit} from './request-limit';

describe('launch API abuse boundary',()=>{
  afterEach(()=>{vi.unstubAllEnvs();query.mockReset();});
  it('stores keyed source/scope hashes, not PII; uses the platform source header',()=>{
    const r=new Request('https://livasports.com',{headers:{'x-vercel-forwarded-for':'203.0.113.8','x-forwarded-for':'spoof'}});
    const hash=requestBucket(r,'events','private-key');expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(requestBucket(new Request(r,{headers:{'x-vercel-forwarded-for':'203.0.113.8'}}),'events','private-key'));
    expect(hash).not.toBe(requestBucket(r,'auth','private-key'));
  });
  it('consumes an atomic durable counter and emits a bounded retry delay',async()=>{
    query.mockResolvedValueOnce({rows:[{allowed:true,retry_after:60}]}).mockResolvedValueOnce({rows:[{allowed:false,retry_after:42}]});
    const db={query:query as QueryExecutor['query']};
    expect(await consumeRequestLimit(db,'b'.repeat(64),90)).toBeNull();
    expect(await consumeRequestLimit(db,'b'.repeat(64),90)).toBe(42);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT(bucket_hash) DO UPDATE');
    expect(query.mock.calls[0][0]).toContain('LEAST(request_rate_limits.attempts+1');
  });
  it('does not invoke the product handler when limited, or when the durable limiter fails',async()=>{
    vi.stubEnv('AUTH_SECRET','u'.repeat(32));
    const handler=vi.fn(async()=>new Response('ok'));
    query.mockResolvedValue({rows:[{allowed:false,retry_after:45}]});
    const request=new Request('https://livasports.com/api/events',{headers:{'x-forwarded-for':'203.0.113.42'}});
    const response=await withRequestLimit('events',handler)(request);
    expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('45');expect(handler).not.toHaveBeenCalled();
    query.mockRejectedValue(new Error('sensitive backend details'));
    const failed=await requestLimit(request,'events');expect(failed?.status).toBe(503);expect(await failed?.text()).not.toContain('sensitive');
  });
  it('requires the existing secret on Vercel, rather than a public/default key',async()=>{
    vi.stubEnv('VERCEL','1');vi.stubEnv('AUTH_SECRET','');
    expect((await requestLimit(new Request('https://livasports.com'),'auth'))?.status).toBe(503);
    expect(query).not.toHaveBeenCalled();
  });
});
