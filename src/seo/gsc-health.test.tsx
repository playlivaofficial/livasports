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
  it('dashboard has no credential fields and performs database-only projected reads',async()=>{
    const f=setup();const health=(await probeGscHealth(now,f.fetcher)).health;
    const db={query:vi.fn(async()=>({rows:[{health:{...health,accessToken:'private-access',refreshToken:'private-refresh'}}]}))} as unknown as QueryExecutor;
    const projected=await readGscHealth(db);const html=renderToStaticMarkup(<GscHealthPanel health={projected}/>);
    expect(html).toContain('analyticsRead');expect(html).toContain('siteOwner');expect(html).not.toContain('private-');expect(JSON.stringify(projected)).not.toContain('Token');
  });
});
