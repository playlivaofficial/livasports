import {describe,it,expect,vi,afterEach} from 'vitest';
import {M5OddsPapiAdapter} from './M5OddsPapiAdapter';
import type {DatabaseClient} from '@/database/client';
function database(consumed=50):DatabaseClient{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('max(started_at)')?[{at:null}]:sql.includes('FROM odds_budget_baselines')?[{hard_limit:5000,consumed}]:[{id:'job'}],rowCount:1}));
  return {query:query as unknown as DatabaseClient['query'],transaction:async work=>work({query:query as unknown as DatabaseClient['query']}),close:async()=>undefined};
}
afterEach(()=>vi.restoreAllMocks());
describe('bounded OddsPapi worker transport',()=>{
  it('uses one singular bookmaker, batches tournaments, and never requests live/props',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json([]));const db=database();const p=new M5OddsPapiAdapter(db,'test-secret-key','job',1);
    await p.snapshot('betano.bet.br',['325','17']);const url=new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe('/v4/odds-by-tournaments');expect(url.searchParams.get('bookmaker')).toBe('betano.bet.br');expect(url.searchParams.get('bookmakers')).toBeNull();expect(url.searchParams.get('tournamentIds')).toBe('325,17');
    expect([...url.searchParams.keys()].some(k=>/live|props/i.test(k))).toBe(false);expect(p.requestCount()).toBe(1);
    await expect(p.snapshot('betsson',['325'])).rejects.toThrow('RUN_CAP');expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('fails closed before network at the durable monthly safety ceiling',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');await expect(new M5OddsPapiAdapter(database(4500),'test-key','job').snapshot('betsson',['325'])).rejects.toThrow('BUDGET');expect(fetch).not.toHaveBeenCalled();
  });
  it('counts failed attempts and emits status/path/query/full sanitized provider error',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({code:'BAD_REQUEST',message:'test-secret-key',detail:{apiKey:'test-secret-key'}},{status:400}));
    const p=new M5OddsPapiAdapter(database(),'test-secret-key','job');let message='';try{await p.snapshot('betsson',['325']);}catch(e){message=(e as Error).message;}
    expect(message).toContain('400');expect(message).toContain('/v4/odds-by-tournaments');expect(message).toContain('BAD_REQUEST');expect(message).not.toContain('test-secret-key');expect(p.requestCount()).toBe(1);
  });
  it('rejects unsubscribed bookmakers and tournament requests before fetching',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');const p=new M5OddsPapiAdapter(database(),'test-key','job');
    await expect(p.snapshot('betano.mx',['325'])).rejects.toThrow('OUT_OF_SCOPE');await expect(p.snapshot('betsson',['999'])).rejects.toThrow('OUT_OF_SCOPE');expect(fetch).not.toHaveBeenCalled();
  });
});
