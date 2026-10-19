import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const spies=vi.hoisted(()=>({
  limit:vi.fn(async()=>null),body:vi.fn(async()=>({batch:[]})),ingest:vi.fn(async()=>({status:204})),
  impression:vi.fn(),embed:vi.fn(),databaseUrl:vi.fn(),DatabaseClient:vi.fn(),
  slip:vi.fn(),comparison:vi.fn(),
}));
vi.mock('@/security/request-limit',()=>({requestLimit:spies.limit}));
vi.mock('@/http/body',()=>({boundedJson:spies.body}));
vi.mock('@/affiliate/server',()=>({impressionRequest:spies.impression,embedClickRequest:spies.embed}));
vi.mock('@/database/client',()=>({databaseUrl:spies.databaseUrl,PostgresDatabaseClient:spies.DatabaseClient}));
vi.mock('@/slip/analytics-server',()=>({parseSlipEvent:vi.fn(),recordSlipEvent:spies.slip,slipEvents:new Set()}));
vi.mock('@/slip/comparison-analytics-server',()=>({parseComparisonEvent:vi.fn(),recordComparisonEvent:spies.comparison,comparisonEvents:new Set()}));
vi.mock('@/analytics/server',async importOriginal=>({...await importOriginal<typeof import('@/analytics/server')>(),ingestClientBatch:spies.ingest}));
import {POST} from './route';

const request=(privacy:Record<string,string>={},body='{}')=>new Request('https://livasports.com/api/events',{
  method:'POST',headers:{origin:'https://livasports.com','content-type':'application/json',...privacy},body,
});
beforeEach(()=>vi.clearAllMocks());

describe('events endpoint privacy boundary',()=>{
  it.each([{dnt:'1'},{'sec-gpc':'1'}] as Record<string,string>[])('ignores every event shape before parsing, rate limiting or persistence: %j',async privacy=>{
    for(const body of ['{invalid',JSON.stringify({v:1,batch:[]}),...['affiliate_impression','affiliate_embed_click','match_open','slip_clear','slip_comparison_view'].map(eventName=>JSON.stringify({eventName}))]){
      const incoming=request(privacy,body);const response=await POST(incoming);
      expect(response.status).toBe(204);expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(incoming.bodyUsed).toBe(false);
    }
    for(const spy of Object.values(spies))expect(spy).not.toHaveBeenCalled();
  });
  it('preserves ordinary analytics when the visitor has not opted out',async()=>{
    const response=await POST(request({dnt:'0','sec-gpc':'0'},JSON.stringify({v:1,batch:[]})));
    expect(response.status).toBe(204);expect(spies.limit).toHaveBeenCalledTimes(1);
    expect(spies.body).toHaveBeenCalledTimes(1);expect(spies.ingest).toHaveBeenCalledTimes(1);
  });
  it('preserves the cross-origin rejection even when privacy signals are present',async()=>{
    const response=await POST(request({dnt:'1',origin:'https://elsewhere.example'}));
    expect(response.status).toBe(403);expect(spies.limit).not.toHaveBeenCalled();expect(spies.body).not.toHaveBeenCalled();
  });
});
