import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {safeBetssonEmbed} from './embed-policy';
import {parseCampaignConfiguration} from './configuration';
import {campaign,dependencies,key} from './fixtures.test-support';
import {publicOffer,resolveOffer} from './service';
import {creativeRequest,embedClickRequest,offersRequest,type CommercialServices} from './server';
import {recordClick} from './analytics';
import {signOffer,verifyOffer} from './tokens';
import type {Creative} from './types';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
// Synthetic contract only; never a captured affiliate source or real asset ID.
const source=()=>`https://c.bannerflow.net/a/${'a'.repeat(24)}?`+new URLSearchParams({display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),redirecturl:'https://record.betsson.bet.br/synthetic-test-only/7',media:'123456',campaign:'7'});
async function fixture(permission:'anonymous'|'consent'='anonymous'){
  const c=campaign();c.operatorCampaignId='7';c.destination='https://record.betsson.bet.br/synthetic-test-only/7';c.domains=['record.betsson.bet.br'];c.destinationType='SPORTSBOOK';
  const creative:Creative={id:'synthetic-embed',locale:'br',placement:'mobile_inline',enabled:true,approved:true,delivery:'BETSSON_EMBED',embedSourceUrl:source(),imageUrl:null,imageAlt:'Synthetic test',width:320,height:100,startsAt:null,endsAt:null};
  c.creatives=[creative];const context={locale:'br' as const,pagePath:'/br',placement:'mobile_inline' as const};
  const deps=dependencies(c),offer=(await resolveOffer(context,deps))!,value=publicOffer(offer,key,Date.now(),permission),tasks:Array<()=>Promise<void>>=[];
  const services:CommercialServices={key,deps,geo:()=>true,defer:fn=>tasks.push(fn),click:vi.fn().mockResolvedValue(null),impression:vi.fn().mockResolvedValue(null)};
  const request=(extra:Record<string,string>={},token=value.token)=>new Request('https://livasports.com/api/commercial/creative?offer='+token,{headers:{'sec-fetch-dest':'iframe','sec-fetch-site':'same-origin',...extra}});
  return {c,creative,context,deps,offer,value,services,tasks,request};
}
describe('G1 approved publisher embed boundary',()=>{
  it('preserves the complete image-mode source without reconstructing tracking',()=>{expect(safeBetssonEmbed(source(),'7')).toBe(source());});
  it.each(['host','http','userinfo','port','fragment','path','duplicate','extra','script','campaign','deeplink','redirect','media'])('rejects unsafe or unapproved source: %s',change=>{
    const u=new URL(source());
    if(change==='host')u.hostname='c.bannerflow.net.evil.invalid';if(change==='http')u.protocol='http:';if(change==='userinfo')u.username='user';if(change==='port')u.port='8443';if(change==='fragment')u.hash='override';if(change==='path')u.pathname='/arbitrary.js';
    if(change==='duplicate')u.searchParams.append('campaign','7');if(change==='extra')u.searchParams.set('callback','injected');if(change==='script')u.searchParams.set('display','animated');if(change==='campaign')u.searchParams.set('campaign','8');if(change==='deeplink')u.searchParams.set('deeplink','javascript:alert(1)');if(change==='redirect')u.searchParams.set('redirecturl','https://evil.invalid');if(change==='media')u.searchParams.set('media','<script>');
    expect(safeBetssonEmbed(u.href,'7')).toBeNull();
  });
  it('accepts only reviewed structured configuration, never arbitrary HTML',()=>{
    const config={bookmaker:'betsson',locale:'br',operatorCampaignId:'7',destinationUrl:'https://record.betsson.bet.br/synthetic-test-only/7',destinationType:'SPORTSBOOK',enabled:true,validFrom:'2026-01-01T00:00:00Z',validUntil:'2030-01-01T00:00:00Z',placements:['mobile_inline'],domains:['record.betsson.bet.br'],approvalReference:'Synthetic test',creatives:[{id:'synthetic',placement:'mobile_inline',delivery:'BETSSON_EMBED',embedSourceUrl:source(),imageAlt:'Synthetic',width:320,height:100,approvalReference:'Synthetic'}]};
    expect(parseCampaignConfiguration(config)).not.toBeNull();
    for(const extra of [{embedSourceUrl:'<script>alert(1)</script>'},{imageUrl:'/sponsors/mixed.png'},{delivery:'ARBITRARY_HTML'},{width:1},{height:0}])expect(parseCampaignConfiguration({...config,creatives:[{...config.creatives[0],...extra}]})).toBeNull();
  });
  it('requires a signed privacy grant and excludes the source from the public offer',async()=>{
    const f=await fixture();expect(()=>publicOffer(f.offer,key)).toThrow('EMBED_PRIVACY_PERMISSION_REQUIRED');
    expect(verifyOffer(f.value.token,key)?.embedPermission).toBe('anonymous');expect(JSON.stringify(f.value)).not.toContain('bannerflow.net');expect(JSON.stringify(f.value)).not.toContain('record.betsson.bet.br');expect(f.value.creative).not.toHaveProperty('embedSourceUrl');
  });
  it('serves only an isolated non-indexable document with exact-host CSP',async()=>{
    const f=await fixture(),r=await creativeRequest(f.request(),f.services),body=await r.text(),csp=r.headers.get('content-security-policy')!;
    expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('x-robots-tag')).toContain('noindex');
    expect(csp).toContain('sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox');expect(csp).not.toContain('allow-same-origin');expect(csp).not.toContain('unsafe-eval');expect(csp).not.toContain('https:;');expect(csp).toContain("frame-ancestors 'self'");
    expect(body).toContain(source().replaceAll('&','&amp;'));expect(body.match(/<script/g)).toHaveLength(2);expect(body).toContain('e.isTrusted');expect(body).not.toContain('document.cookie');expect(f.tasks).toHaveLength(0);
  });
  it.each(['cross-site','top-level','geo','disabled','expired','no-grant','dnt','gpc','wrong-source'])('denies an unsafe/ineligible frame: %s',async change=>{
    const f=await fixture();let request=f.request();if(change==='cross-site')request=f.request({'sec-fetch-site':'cross-site'});if(change==='top-level')request=f.request({'sec-fetch-dest':'document'});if(change==='geo')f.services.geo=()=>false;if(change==='disabled')f.c.enabled=false;if(change==='wrong-source')f.creative.embedSourceUrl='https://evil.invalid/a.js';
    if(change==='expired')request=f.request({},signOffer({...verifyOffer(f.value.token,key)!,expiresAt:Date.now()-1},key));
    if(change==='no-grant'){const token=verifyOffer(f.value.token,key)!;delete token.embedPermission;request=f.request({},signOffer(token,key));}
    if(change==='dnt')request=f.request({dnt:'1'});if(change==='gpc')request=f.request({'sec-gpc':'1'});
    expect((await creativeRequest(request,f.services)).status).toBe(404);expect(f.tasks).toHaveLength(0);
  });
  it('checks consent at grant issuance and keeps credentialless frames cookie-free',async()=>{
    vi.stubEnv('AFFILIATE_ANALYTICS_MODE','consent');const f=await fixture('consent');
    const request=(cookie='')=>new Request('https://livasports.com/api/commercial/offers',{method:'POST',headers:{origin:'https://livasports.com','content-type':'application/json',cookie},body:JSON.stringify([f.context])});
    expect((await (await offersRequest(request(),f.services)).json()).offers).toEqual([null]);
    expect((await (await offersRequest(request('livasports_analytics_consent=granted'),f.services)).json()).offers[0].embedPermission).toBe('consent');
    expect((await creativeRequest(f.request(),f.services)).status).toBe(200);const a=await fixture();expect((await creativeRequest(a.request(),a.services)).status).toBe(404);
    vi.stubEnv('AFFILIATE_ANALYTICS_MODE','off');expect((await creativeRequest(f.request(),f.services)).status).toBe(404);
  });
  it('records an observed embed activation separately from an issued redirect',async()=>{
    const f=await fixture(),request=new Request('https://livasports.com/api/events',{method:'POST',headers:{origin:'https://livasports.com','sec-fetch-site':'same-origin'}});
    const body={eventId:crypto.randomUUID(),eventName:'affiliate_embed_click',offer:f.value.token,qa:true};
    const fetch=vi.spyOn(globalThis,'fetch');expect((await embedClickRequest(request,body,f.services)).status).toBe(204);expect(f.tasks).toHaveLength(1);await f.tasks[0]();
    expect(f.services.click).toHaveBeenCalledWith(expect.anything(),expect.any(String),'QA_TEST',key,'EMBED_ACTIVATION');expect(fetch).not.toHaveBeenCalled();
    const query=vi.fn().mockResolvedValue({rows:[]});await recordClick({query},f.offer,'test','QA_TEST',key,10000,'EMBED_ACTIVATION');expect(query.mock.calls[0][1][18]).toBe('EMBED_ACTIVATION');expect(query.mock.calls[0][0]).toContain('ON CONFLICT(dedup_key) DO NOTHING');
    expect((await embedClickRequest(request,{...body,destination:'override'},f.services)).status).toBe(400);
  });
});
