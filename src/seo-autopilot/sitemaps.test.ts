import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {sitemapHarness,sitemapNow as now,json,xml} from './sitemap.test-support';
import {maintainSeoSitemaps} from './sitemaps';
import {parseSitemap,readSitemap,SITEMAP_READ_TIMEOUT_MS} from './sitemap-fetch';
import {googleDiagnostic,nextSitemapRetry,sitemapError} from '@/seo/sitemap-errors';
import {GSC_WRITE_SCOPE,type GscHealth} from '@/seo/gsc-health';
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
const later=(hours=24)=>new Date(now.getTime()+hours*3600000);
describe('durable sitemap side effect',()=>{
  it('submits each changed root once; immediate and next-day unchanged runs never write again',async()=>{
    const f=sitemapHarness();expect((await f.run()).every(r=>r.state==='SUBMITTED')).toBe(true);expect(f.puts()).toHaveLength(2);
    expect((await f.run()).every(r=>r.state==='UNCHANGED')).toBe(true);await f.run(later());expect(f.puts()).toHaveLength(2);
    f.change();expect((await f.run()).every(r=>r.state==='BACKOFF')).toBe(true);await f.run(later());expect(f.puts()).toHaveLength(4);
  });
  it('overlapping workers never PUT the same root twice',async()=>{
    const f=sitemapHarness();await Promise.all([f.run(),f.run()]);expect(f.puts()).toHaveLength(2);
    expect([...f.stored.values()].every(r=>r.lease_token===null)).toBe(true);
  });
  it('read failure after a proven successful write retains attempted/success timestamps',async()=>{
    const f=sitemapHarness();await f.run();const before=[...f.stored.values()].map(r=>({at:r.submitted_at,attempt:r.attempted_at,hash:r.submitted_hash}));
    const bad:typeof fetch=async(i,o)=>String(i).startsWith('https://livasports.com/')?new Response('unavailable',{status:503}):f.fetcher(i,o);
    await f.run(later(),bad);await f.run(later(26));expect(f.puts()).toHaveLength(2);
    expect([...f.stored.values()].map(r=>({at:r.submitted_at,attempt:r.attempted_at,hash:r.submitted_hash}))).toEqual(before);
  });
  it('scope-insufficient 403 is classified without exposing Google body or headers',async()=>{
    const d=await googleDiagnostic(json({error:{message:'private-access private-secret',details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},403),'SUBMIT');
    expect(d).toMatchObject({category:'PERMISSION_ERROR',reason:'SCOPE_INSUFFICIENT',httpStatus:403});expect(JSON.stringify(d)).not.toContain('private-');
  });
  it('a 12.187 second cold sitemap response succeeds within the corrected read budget',async()=>{
    vi.useFakeTimers();const fetcher:typeof fetch=async()=>{await new Promise(r=>setTimeout(r,12187));return new Response(xml(),{headers:{'content-type':'application/xml'}});};
    const pending=readSitemap('https://livasports.com/sports-sitemaps.xml',fetcher,{retries:0,deadline:Date.now()+65000});
    await vi.advanceTimersByTimeAsync(12187);expect((await pending).root).toBe('urlset');expect(SITEMAP_READ_TIMEOUT_MS).toBe(20000);
  });
  it('public fetch timeout retries once, then succeeds without making Google fail',async()=>{
    const f=sitemapHarness();let timedOut=false;
    const fetcher:typeof fetch=async(i,o)=>{if(String(i).endsWith('/sports-sitemaps.xml')&&!timedOut){timedOut=true;throw new DOMException('private-timeout','TimeoutError');}return f.fetcher(i,o);};
    expect((await f.run(now,fetcher)).every(r=>r.state==='SUBMITTED')).toBe(true);expect(f.sleep).toHaveBeenCalledTimes(1);expect(f.puts()).toHaveLength(2);
  });
  it('persistent fetch failure is not a Google write failure and does not erase prior success',async()=>{
    const f=sitemapHarness();await f.run();const saved=f.stored.get('/sports-sitemaps.xml')!.submitted_at;let health:GscHealth|undefined;
    const fail:typeof fetch=async(i,o)=>{if(String(i).endsWith('/sports-sitemaps.xml'))throw new DOMException('private','TimeoutError');return f.fetcher(i,o);};
    await maintainSeoSitemaps(f.db,later(),fail,h=>{health=h;},{log:f.log,sleep:f.sleep});
    expect(health).toMatchObject({analyticsRead:'OK',sitemapRead:'OK',sitemapWrite:'OK',sitemapMaintenanceError:'NETWORK_ERROR'});
    expect(f.stored.get('/sports-sitemaps.xml')).toMatchObject({submitted_at:saved,error_code:'NETWORK_ERROR',diagnostic:{stage:'FETCH',reason:'TIMEOUT'}});
    await f.run(later());expect(f.puts()).toHaveLength(2);await f.run(later(26));expect(f.stored.get('/sports-sitemaps.xml')!.error_code).toBeNull();expect(f.puts()).toHaveLength(2);
  });
  it.each([500,503,429])('HTTP %s write preserves success and retries only when due',async status=>{
    const f=sitemapHarness();await f.run();f.change();let calls=0;
    const fail:typeof fetch=async(i,o)=>{if(o?.method==='PUT'){calls++;return json({error:{message:'private-access'}},status);}return f.fetcher(i,o);};
    await f.run(later(),fail);expect(calls).toBe(2);await f.run(later(),fail);expect(calls).toBe(2);
    expect([...f.stored.values()].every(r=>r.submitted_hash&&r.next_retry_at)).toBe(true);
    await f.run(later(26));expect(f.puts()).toHaveLength(4);expect([...f.stored.values()].every(r=>r.error_code===null)).toBe(true);
  });
  it.each([401,403,400,404])('HTTP %s permanent rejection does not retry blindly next day',async status=>{
    const f=sitemapHarness();let calls=0;const fail:typeof fetch=async(i,o)=>{if(o?.method==='PUT'){calls++;return json({error:{message:'private-refresh'}},status);}return f.fetcher(i,o);};
    await f.run(now,fail);await f.run(later(),fail);expect(calls).toBe(2);expect([...f.stored.values()].every(r=>r.state==='BLOCKED'&&!r.next_retry_at)).toBe(true);
    expect(JSON.stringify(f.log.mock.calls)).not.toContain('private-');
  });
  it('readonly scope never writes; reads remain healthy',async()=>{
    const f=sitemapHarness(GSC_WRITE_SCOPE+'.readonly');await f.run();expect(f.puts()).toHaveLength(0);expect(f.stored.get('/sitemap.xml')!.diagnostic).toMatchObject({reason:'SCOPE_INSUFFICIENT'});
  });
  it('property host mismatch is rejected without any PUT',async()=>{
    const f=sitemapHarness();vi.stubEnv('GSC_PROPERTY','sc-domain:other.example');await f.run();expect(f.puts()).toHaveLength(0);expect(f.stored.get('/sitemap.xml')!.error_code).toBe('INVALID_PROPERTY');
  });
  it('429 respects Retry-After and quota waits at least a day',async()=>{
    const r=json({},429);r.headers.set('retry-after','172800');const d=await googleDiagnostic(r,'SUBMIT');expect(nextSitemapRetry(d,1,now)).toEqual(later(48));
    const q=await googleDiagnostic(json({error:{errors:[{reason:'dailyLimitExceeded'}]}},403),'SUBMIT');expect(q.category).toBe('QUOTA_ERROR');expect(nextSitemapRetry(q,1,now)).toEqual(later());
  });
  it('ambiguous PUT acceptance is reconciled by Google readback without another PUT',async()=>{
    const f=sitemapHarness();const fail:typeof fetch=async(i,o)=>{if(o?.method==='PUT')throw new DOMException('private','TimeoutError');return f.fetcher(i,o);};
    await f.run(now,fail);expect([...f.stored.values()].every(r=>r.attempted_hash)).toBe(true);
    const readback:typeof fetch=async(i,o)=>{if(String(i).startsWith('https://searchconsole.googleapis.com')&&String(i).endsWith('/sitemaps'))return json({sitemap:['/sitemap.xml','/sports-sitemaps.xml'].map(path=>({path:'https://livasports.com'+path,lastSubmitted:now.toISOString()}))});return f.fetcher(i,o);};
    expect((await f.run(later(2),readback)).every(r=>r.state==='UNCHANGED')).toBe(true);expect(f.puts()).toHaveLength(0);expect([...f.stored.values()].every(r=>r.error_code===null)).toBe(true);
  });
  it('malformed sitemap blocks write, then valid content recovers',async()=>{
    const f=sitemapHarness();const bad:typeof fetch=async(i,o)=>String(i).startsWith('https://livasports.com/')?new Response('<urlset><broken>',{headers:{'content-type':'application/xml'}}):f.fetcher(i,o);
    await f.run(now,bad);expect(f.puts()).toHaveLength(0);expect(f.stored.get('/sitemap.xml')!.error_code).toBe('INVALID_SITEMAP');
    await f.run(later());expect(f.puts()).toHaveLength(2);
  });
  it('HTML HTTP 200 is not accepted as XML',async()=>{
    const f=async()=>new Response('<html>Oops</html>',{headers:{'content-type':'text/html'}});
    await expect(readSitemap('https://livasports.com/sitemap.xml',f,{retries:0,deadline:Date.now()+1000})).rejects.toMatchObject({diagnostic:{category:'INVALID_SITEMAP',reason:'CONTENT_TYPE_NOT_XML'}});
  });
  it('preserves existing canonical competition query URLs and XML entity decoding',()=>{
    const doc=xml().replace('https://livasports.com/br','https://livasports.com/br/futebol?competition=premier-league&amp;tab=results');
    expect(parseSitemap(doc).urls).toEqual(['https://livasports.com/br/futebol?competition=premier-league&tab=results']);
  });
  it.each(['<urlset>','<!DOCTYPE x SYSTEM "file:///secret"><urlset/>','<html/>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://evil.example</loc></url></urlset>'])('rejects malformed/unsafe XML: %s',doc=>expect(()=>parseSitemap(doc)).toThrow());
  it('caps exponential backoff and never schedules blind auth retries',()=>{expect(nextSitemapRetry(sitemapError('NETWORK_ERROR','FETCH','TIMEOUT').diagnostic,6,now)).toEqual(later());expect(nextSitemapRetry(sitemapError('AUTH_ERROR','AUTH','TOKEN_REJECTED').diagnostic,1,now)).toBeNull();});
});
