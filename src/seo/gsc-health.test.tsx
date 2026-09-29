import {afterEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
import {classifyScope,GSC_WRITE_SCOPE,gscResponseStatus,probeGscHealth,readGscHealth,type GscHealth} from './gsc-health';
import {GscHealthPanel} from '@/owner/GscHealth';
import {maintainSeoSitemaps} from '@/seo-autopilot/sitemaps';
import type {QueryExecutor} from '@/database/client';

const now=new Date('2026-09-29T12:00:00Z');
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function setup(scope=GSC_WRITE_SCOPE,permission='siteOwner',writeStatus=204){
  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON','');vi.stubEnv('GSC_CLIENT_ID','private-client');vi.stubEnv('GSC_CLIENT_SECRET','private-secret');vi.stubEnv('GSC_REFRESH_TOKEN','private-refresh');vi.stubEnv('GSC_PROPERTY','sc-domain:livasports.com');
  const stored=new Map<string,Record<string,unknown>>();let changed=false;
  const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
    const path=String(args[0]);let row=stored.get(path);
    if(sql.startsWith('SELECT *'))return {rows:row?[row]:[]};
    if(sql.startsWith('SELECT submitted_at'))return {rows:[...stored.values()]};
    if(sql.startsWith('INSERT')){row??={path};row.content_hash=args[1];stored.set(path,row);}
    if(sql.includes('SET attempted_at'))row!.attempted_at=args[1];
    if(sql.includes('SET submitted_hash'))Object.assign(row!,{submitted_hash:args[1],submitted_at:args[2],error_code:null});
    if(sql.includes("SET state='SUBMISSION_BLOCKED'"))row!.error_code=args[1];
    if(sql.includes("SET state='FAILED'"))row!.error_code='SITEMAP_MAINTENANCE_FAILED';
    if(sql.includes('SET state=$3,error_code=NULL')&&row?.submitted_hash===args[1]&&row?.error_code==='SITEMAP_MAINTENANCE_FAILED')Object.assign(row,{state:args[2],error_code:null});
    return {rows:[]};
  });
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.includes('oauth2.googleapis.com'))return json({access_token:'private-access',scope});
    if(init?.method==='PUT')return writeStatus===204?new Response(null,{status:204}):json({error:{message:'private-secret',details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},writeStatus);
    if(url.startsWith('https://livasports.com/'))return new Response(`<urlset><url><loc>https://livasports.com/br</loc><lastmod>${changed?'2026-09-30':'2026-09-29'}</lastmod></url></urlset>`);
    if(url.endsWith('/query'))return json({rows:[]});
    if(url.endsWith('/sitemaps'))return json({sitemap:[]});
    return json({siteUrl:'sc-domain:livasports.com',permissionLevel:permission});
  }) as unknown as ReturnType<typeof vi.fn<typeof fetch>>;
  return {db:{query} as unknown as QueryExecutor,fetcher,stored,change:()=>{changed=true;},puts:()=>fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')};
}
afterEach(()=>vi.unstubAllEnvs());
describe('GSC write scope, evidence and deduplication',()=>{
  it('classifies exact grants, not similarly named scopes',()=>{
    expect(classifyScope(GSC_WRITE_SCOPE+'.readonly')).toBe('READ_ONLY');expect(classifyScope(GSC_WRITE_SCOPE)).toBe('WEBMASTERS');expect(classifyScope(GSC_WRITE_SCOPE+'.fake')).toBe('UNKNOWN');
  });
  it('distinguishes scope-insufficient 403 without exposing the provider body',async()=>{
    expect(await gscResponseStatus(json({error:{message:'private-access',details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},403))).toBe('SCOPE_INSUFFICIENT');
    expect(await gscResponseStatus(json({error:{message:'private-secret'}},403))).toBe('PROPERTY_DENIED');
    expect(await gscResponseStatus(json({},500))).toBe('API_ERROR');
  });
  it('readonly credentials preserve analytics/sitemap reads and never attempt a PUT',async()=>{
    const f=setup(GSC_WRITE_SCOPE+'.readonly');let health:GscHealth|undefined;
    await maintainSeoSitemaps(f.db,now,f.fetcher,h=>{health=h;});
    expect(health).toMatchObject({analyticsRead:'OK',sitemapRead:'OK',sitemapWrite:'SCOPE_INSUFFICIENT',authScopeStatus:'READ_ONLY',propertyPermissionStatus:'siteOwner'});expect(f.puts()).toHaveLength(0);
  });
  it('full scope alone is not evidence that a write succeeded',async()=>{
    const f=setup();expect((await probeGscHealth(now,f.fetcher)).health).toMatchObject({authScopeStatus:'WEBMASTERS',sitemapWrite:'NOT_CHECKED'});
  });
  it('submits changed roots once; immediate and next-day unchanged cycles never resubmit',async()=>{
    const f=setup();let health:GscHealth|undefined;
    expect((await maintainSeoSitemaps(f.db,now,f.fetcher,h=>{health=h;})).every(r=>r.state==='SUBMITTED')).toBe(true);
    expect(f.puts()).toHaveLength(2);expect(health).toMatchObject({sitemapWrite:'OK',lastSuccessfulSitemapSubmission:now.toISOString(),lastSubmissionError:null});
    for(const date of [now,new Date(now.getTime()+86_400_000)])expect((await maintainSeoSitemaps(f.db,date,f.fetcher)).every(r=>r.state==='UNCHANGED')).toBe(true);
    expect(f.puts()).toHaveLength(2);
    f.change();expect((await maintainSeoSitemaps(f.db,now,f.fetcher)).every(r=>r.state==='BACKOFF')).toBe(true);
    await maintainSeoSitemaps(f.db,new Date(now.getTime()+86_400_000),f.fetcher);expect(f.puts()).toHaveLength(4);
  });
  it('reports restricted property permission and prevents writes',async()=>{
    const f=setup(GSC_WRITE_SCOPE,'siteRestrictedUser');let health:GscHealth|undefined;
    await maintainSeoSitemaps(f.db,now,f.fetcher,h=>{health=h;});expect(health?.propertyPermissionStatus).toBe('siteRestrictedUser');expect(health?.sitemapWrite).toBe('PROPERTY_DENIED');expect(f.puts()).toHaveLength(0);
  });
  it('recovers a transient sitemap read failure without resubmitting or changing successful timestamps',async()=>{
    const f=setup();let health:GscHealth|undefined;
    await maintainSeoSitemaps(f.db,now,f.fetcher);
    const saved=[...f.stored.values()].map(r=>({hash:r.submitted_hash,at:r.submitted_at,attempt:r.attempted_at}));
    const fail:typeof fetch=async(input,init)=>{if(String(input)==='https://livasports.com/sports-sitemaps.xml')throw Error('private-failure');return f.fetcher(input,init);};
    await maintainSeoSitemaps(f.db,now,fail,h=>{health=h;});
    expect(health?.lastSubmissionError).toBe('API_ERROR');
    const result=await maintainSeoSitemaps(f.db,now,f.fetcher,h=>{health=h;});
    expect(result.every(r=>r.state==='UNCHANGED')).toBe(true);
    expect(health).toMatchObject({sitemapWrite:'OK',lastSubmissionError:null});
    expect(f.puts()).toHaveLength(2);
    expect([...f.stored.values()].map(r=>({hash:r.submitted_hash,at:r.submitted_at,attempt:r.attempted_at}))).toEqual(saved);
  });
  it('does not clear a later write failure for changed content or genuine Google rejection',async()=>{
    const f=setup();let health:GscHealth|undefined;
    await maintainSeoSitemaps(f.db,now,f.fetcher);
    Object.assign(f.stored.get('/sports-sitemaps.xml')!,{error_code:'SITEMAP_MAINTENANCE_FAILED',attempted_at:new Date(now.getTime()+1000)});f.change();
    await maintainSeoSitemaps(f.db,now,f.fetcher,h=>{health=h;});
    expect(health?.lastSubmissionError).toBe('API_ERROR');expect(f.puts()).toHaveLength(2);
    const g=setup();await maintainSeoSitemaps(g.db,now,g.fetcher);
    g.stored.get('/sports-sitemaps.xml')!.error_code='SCOPE_INSUFFICIENT';
    await maintainSeoSitemaps(g.db,now,g.fetcher,h=>{health=h;});
    expect(health?.lastSubmissionError).toBe('SCOPE_INSUFFICIENT');expect(g.puts()).toHaveLength(2);
  });
  it('clears a proven read failure for changed content while retaining the daily submission backoff',async()=>{
    const f=setup();let health:GscHealth|undefined;await maintainSeoSitemaps(f.db,now,f.fetcher);
    const row=f.stored.get('/sports-sitemaps.xml')!,submitted=row.submitted_hash,at=row.submitted_at,attempt=row.attempted_at;
    row.error_code='SITEMAP_MAINTENANCE_FAILED';f.change();
    const result=await maintainSeoSitemaps(f.db,now,f.fetcher,h=>{health=h;});
    expect(result.every(r=>r.state==='BACKOFF')).toBe(true);expect(f.puts()).toHaveLength(2);
    expect(row).toMatchObject({state:'BACKOFF',error_code:null,submitted_hash:submitted,submitted_at:at,attempted_at:attempt});
    expect(row.content_hash).not.toBe(submitted);expect(health).toMatchObject({sitemapWrite:'OK',lastSubmissionError:null});
    await maintainSeoSitemaps(f.db,now,f.fetcher);expect(f.puts()).toHaveLength(2);
  });
  it('does not hide a current property access failure when a transient read recovers',async()=>{
    const f=setup();let health:GscHealth|undefined;await maintainSeoSitemaps(f.db,now,f.fetcher);
    f.stored.get('/sports-sitemaps.xml')!.error_code='SITEMAP_MAINTENANCE_FAILED';
    const denied:typeof fetch=async(input,init)=>String(input).endsWith('sc-domain%3Alivasports.com')?json({},403):f.fetcher(input,init);
    await maintainSeoSitemaps(f.db,now,denied,h=>{health=h;});
    expect(health?.sitemapWrite).toBe('PROPERTY_DENIED');expect(f.puts()).toHaveLength(2);
  });
  it('contains failed writes, preserves prior success hashes and applies backoff',async()=>{
    const f=setup(GSC_WRITE_SCOPE,'siteOwner',403);let health:GscHealth|undefined;
    await maintainSeoSitemaps(f.db,now,f.fetcher,h=>{health=h;});expect(health?.lastSubmissionError).toBe('SCOPE_INSUFFICIENT');
    expect([...f.stored.values()].every(r=>!r.submitted_hash)).toBe(true);
    await maintainSeoSitemaps(f.db,now,f.fetcher);expect(f.puts()).toHaveLength(2);expect(JSON.stringify(health)).not.toContain('private-');
  });
  it('missing returned scope fails closed for writes',async()=>{const f=setup('');await maintainSeoSitemaps(f.db,now,f.fetcher);expect(f.puts()).toHaveLength(0);});
  it('network/auth failure returns sanitized health instead of throwing',async()=>{
    setup();const f=vi.fn(async()=>{throw Error('private-refresh');});const {health}=await probeGscHealth(now,f);
    expect(health.analyticsRead).toBe('AUTH_ERROR');expect(JSON.stringify(health)).not.toContain('private-');
  });
  it('malformed property response remains unknown rather than stopping SEO',async()=>{
    const f=setup();const fetcher:typeof fetch=async(input,init)=>String(input).endsWith('sc-domain%3Alivasports.com')?json(null):f.fetcher(input,init);
    expect((await probeGscHealth(now,fetcher)).health.propertyPermissionStatus).toBe('UNKNOWN');
  });
  it('dashboard has no credential fields and performs database-only projected reads',async()=>{
    const f=setup();const health=(await probeGscHealth(now,f.fetcher)).health;
    const db={query:vi.fn(async()=>({rows:[{health:{...health,accessToken:'private-access',refreshToken:'private-refresh'}}]}))} as unknown as QueryExecutor;
    const projected=await readGscHealth(db);const html=renderToStaticMarkup(<GscHealthPanel health={projected}/>);
    expect(html).toContain('analyticsRead');expect(html).toContain('siteOwner');expect(html).not.toContain('private-');expect(JSON.stringify(projected)).not.toContain('Token');
  });
});
