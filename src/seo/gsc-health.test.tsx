import {afterEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
import {classifyScope,GSC_WRITE_SCOPE,gscResponseStatus,probeGscHealth,readGscHealth} from './gsc-health';
import {GscHealthPanel} from '@/owner/GscHealth';
import type {QueryExecutor} from '@/database/client';
const now=new Date('2026-09-29T12:00:00Z');
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function setup(scope=GSC_WRITE_SCOPE,permission='siteOwner'){
  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON','');vi.stubEnv('GSC_CLIENT_ID','private-client');vi.stubEnv('GSC_CLIENT_SECRET','private-secret');vi.stubEnv('GSC_REFRESH_TOKEN','private-refresh');vi.stubEnv('GSC_PROPERTY','sc-domain:livasports.com');
  return vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);if(url.includes('oauth2.googleapis.com'))return json({access_token:'private-access',scope});
    if(url.endsWith('/query'))return json({rows:[]});if(url.endsWith('/sitemaps'))return json({sitemap:[]});
    return json({siteUrl:'sc-domain:livasports.com',permissionLevel:permission});
  }) as unknown as typeof fetch;
}
afterEach(()=>vi.unstubAllEnvs());
describe('GSC access evidence boundary',()=>{
  it('classifies exact grants only',()=>{expect(classifyScope(GSC_WRITE_SCOPE+'.readonly')).toBe('READ_ONLY');expect(classifyScope(GSC_WRITE_SCOPE)).toBe('WEBMASTERS');expect(classifyScope(GSC_WRITE_SCOPE+'.fake')).toBe('UNKNOWN');});
  it('reports scope and permission distinctly without provider message leakage',async()=>{
    expect(await gscResponseStatus(json({error:{message:'private-access',details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},403))).toBe('SCOPE_INSUFFICIENT');
    expect(await gscResponseStatus(json({error:{message:'private-secret'}},403))).toBe('PROPERTY_DENIED');
    expect(await gscResponseStatus(json({},500))).toBe('TRANSIENT_GOOGLE_ERROR');
  });
  it('read-only scope still has healthy reads',async()=>{expect((await probeGscHealth(now,setup(GSC_WRITE_SCOPE+'.readonly'))).health).toMatchObject({analyticsRead:'OK',sitemapRead:'OK',sitemapWrite:'SCOPE_INSUFFICIENT'});});
  it('scope alone is not write success',async()=>{expect((await probeGscHealth(now,setup())).health).toMatchObject({authScopeStatus:'WEBMASTERS',sitemapWrite:'NOT_CHECKED'});});
  it('restricted property remains blocked',async()=>{expect((await probeGscHealth(now,setup(GSC_WRITE_SCOPE,'siteRestrictedUser'))).health.sitemapWrite).toBe('PROPERTY_DENIED');});
  it('network failure is not mislabeled as invalid credentials',async()=>{setup();const {health}=await probeGscHealth(now,async()=>{throw Error('private-refresh');});expect(health.analyticsRead).toBe('NETWORK_ERROR');expect(JSON.stringify(health)).not.toContain('private-');});
  it('malformed property response is unknown rather than throwing',async()=>{const f=setup();const fetcher:typeof fetch=async(input,init)=>String(input).endsWith('sc-domain%3Alivasports.com')?json(null):f(input,init);expect((await probeGscHealth(now,fetcher)).health.propertyPermissionStatus).toBe('UNKNOWN');});
  it('projects dashboard scalar evidence without credentials or live requests',async()=>{
    const health=(await probeGscHealth(now,setup())).health;
    const db={query:vi.fn(async(sql:string)=>({rows:sql.includes('seo_autopilot_runs')?[{health:{...health,accessToken:'private-access',refreshToken:'private-refresh'}}]:[{path:'/sitemap.xml',state:'RETRY_PENDING',diagnostic:{stage:'FETCH',httpStatus:503},error_code:'NETWORK_ERROR',next_retry_at:'2026-10-01T12:00:00Z'}]}))} as unknown as QueryExecutor;
    const projected=await readGscHealth(db),html=renderToStaticMarkup(<GscHealthPanel health={projected}/>);
    expect(html).toContain('analyticsRead');expect(html).toContain('siteOwner');expect(html).toContain('https://livasports.com/sitemap.xml');expect(html).toContain('FETCH');expect(html).not.toContain('private-');expect(JSON.stringify(projected)).not.toContain('Token');
  });
});
