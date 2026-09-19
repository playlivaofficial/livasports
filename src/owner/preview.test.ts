import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/security/request-limit',()=>({requestLimit:async()=>null}));
import {accessKeyHash,authorizedOwnerKey,newOwnerSession,ownerCookie,ownerSessionSeconds,previewBinding,requestOwnerSession,signOwnerSession} from './session';
import {ownerAction,ownerStatus} from './server';
import type {OwnerLoginLimiter} from './rate-limit';
import {requestCommercialGeo,requestCountry} from '@/odds/commercial-geo';
import {geoAllowed} from '@/affiliate/policy';
import {offersRequest,outboundRequest,impressionRequest,creativeRequest,embedClickRequest,legacyOutbound,type CommercialServices} from '@/affiliate/server';
import {campaign,context,dependencies,key} from '@/affiliate/fixtures.test-support';
import {publicOffer,resolveOffer} from '@/affiliate/service';
import {signOffer,verifyOffer} from '@/affiliate/tokens';
import type {CommercialContext} from '@/affiliate/types';
import {POST as productEvent} from '@/app/api/events/route';
import {approvedImagePath,qaCreativeDocument} from './creative';

const access='q'.repeat(43),origin='https://livasports.com';
const openLimiter:OwnerLoginLimiter={check:async()=>null,failure:async()=>null,success:async()=>undefined};
const sessionHeaders=(preview=true)=>new Headers({'cookie':ownerCookie+'='+signOwnerSession({...newOwnerSession(),preview}),'x-vercel-ip-country':'GE'});
const post=(body:unknown,headers:HeadersInit={})=>new Request(origin+'/api/owner/preview',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json',...Object.fromEntries(new Headers(headers))},body:JSON.stringify(body)});
beforeEach(()=>{vi.stubEnv('VERCEL','1');vi.stubEnv('OWNER_QA_SESSION_SECRET','s'.repeat(43));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash(access));vi.stubEnv('AFFILIATE_ANALYTICS_MODE','anonymous');});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('owner authentication and GEO isolation',()=>{
  it('authenticates only the dedicated high entropy owner key and signs an off-by-default secure session',async()=>{
    expect(authorizedOwnerKey(access)).toBe(true);expect(authorizedOwnerKey('  '+access+'\r\n')).toBe(true);expect(authorizedOwnerKey('wrong')).toBe(false);
    expect((await ownerAction(post({action:'login',key:'wrong'}),openLimiter)).status).toBe(401);
    const r=await ownerAction(post({action:'login',key:'  '+access+'\n'}),openLimiter),cookie=r.headers.get('set-cookie')!;
    expect(r.status).toBe(200);expect(await r.json()).toEqual({authorized:true,preview:false});
    for(const flag of ['__Host-','Secure','HttpOnly','SameSite=Strict','Path=/','Max-Age='])expect(cookie).toContain(flag);
    expect(ownerSessionSeconds).toBe(30*24*60*60);expect(Number(/Max-Age=(\d+)/.exec(cookie)?.[1])).toBeGreaterThanOrEqual(ownerSessionSeconds-2);
    expect(Number(/Max-Age=(\d+)/.exec(cookie)?.[1])).toBeLessThanOrEqual(ownerSessionSeconds);
    expect(cookie).not.toContain(access);expect(r.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rate-limits failed logins without binding a valid key or session to a device',async()=>{
    let failures=0;const limiter:OwnerLoginLimiter={check:async()=>failures>=5?900:null,failure:async()=>++failures>=5?900:null,success:async()=>{failures=0;}};
    for(let attempt=1;attempt<5;attempt++)expect((await ownerAction(post({action:'login',key:'wrong'}),limiter)).status).toBe(401);
    const blocked=await ownerAction(post({action:'login',key:'wrong'}),limiter);expect(blocked.status).toBe(429);expect(blocked.headers.get('retry-after')).toBe('900');
    failures=0;
    const first=await ownerAction(post({action:'login',key:access},{'x-forwarded-for':'203.0.113.1'}),limiter);
    const second=await ownerAction(post({action:'login',key:access},{'x-forwarded-for':'198.51.100.2','user-agent':'Different browser'}),limiter);
    expect(first.status).toBe(200);expect(second.status).toBe(200);
    for(const response of [first,second])expect(requestOwnerSession(new Headers({cookie:response.headers.get('set-cookie')!.split(';')[0]}))).toMatchObject({preview:false});
  });
  it('rejects cross-origin, missing-origin, unauthenticated toggle and oversize inputs',async()=>{
    for(const headers of ([{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'},{origin:''}] as Record<string,string>[]))expect((await ownerAction(post({action:'login',key:access},headers))).status).toBe(403);
    expect((await ownerAction(post({action:'preview',enabled:true}))).status).toBe(401);
    expect((await ownerAction(post({action:'login',key:access,padding:'x'.repeat(3000)}))).status).toBe(400);
  });
  it('turns on/off, logs out, preserves real GEO and ignores public spoofing',async()=>{
    const h=sessionHeaders(false);expect(requestCountry(h)).toBe('GE');expect(requestCommercialGeo(h)).toBeNull();
    const on=await ownerAction(post({action:'preview',enabled:true},h));h.set('cookie',on.headers.get('set-cookie')!.split(';')[0]);
    expect(requestCommercialGeo(h)).toBe('BR');expect(requestCountry(h)).toBe('GE');expect(geoAllowed(new Request(origin,{headers:h}),'br')).toBe(true);
    expect(await ownerStatus(new Request(origin,{headers:h})).json()).toMatchObject({authorized:true,preview:true,realCountry:'GE'});
    const off=await ownerAction(post({action:'preview',enabled:false},h));h.set('cookie',off.headers.get('set-cookie')!.split(';')[0]);expect(requestCommercialGeo(h)).toBeNull();
    const logout=await ownerAction(post({action:'logout'},h));expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    const forged=new Request(origin+'/br?geo=br&qa=1',{headers:{'x-vercel-ip-country':'GE','x-livasports-qa':'1','x-owner-preview':'BR',cookie:'commercialGeo=BR; qa=1'}});expect(geoAllowed(forged,'br')).toBe(false);
    expect(requestCommercialGeo(new Headers({'x-vercel-ip-country':'BR'}))).toBe('BR');
  });
  it('rejects modified, expired, duplicate, wrong-secret and revoked sessions',()=>{
    const h=sessionHeaders();expect(requestOwnerSession(h)).not.toBeNull();const raw=h.get('cookie')!;
    for(const cookie of [raw+'x',raw+'; '+raw,ownerCookie+'='+signOwnerSession({...newOwnerSession(),expiresAt:Date.now()-1,preview:true})])expect(requestOwnerSession(new Headers({cookie}))).toBeNull();
    vi.stubEnv('OWNER_QA_SESSION_SECRET','t'.repeat(43));expect(requestOwnerSession(h)).toBeNull();vi.stubEnv('OWNER_QA_SESSION_SECRET','s'.repeat(43));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash('r'.repeat(43)));expect(requestOwnerSession(h)).toBeNull();
    vi.stubEnv('OWNER_QA_SESSION_SECRET','weak');expect(authorizedOwnerKey(access)).toBe(false);
  });
});
async function commercialFixture(){
  const c=campaign(),deps=dependencies(c),tasks:Array<()=>Promise<void>>=[];
  const services:CommercialServices={deps,key,geo:geoAllowed,defer:fn=>tasks.push(fn),click:vi.fn(),impression:vi.fn()};
  const h=sessionHeaders(),offer=(await resolveOffer(context(),deps))!,value=publicOffer(offer,key,Date.now(),undefined,previewBinding(h));
  return {c,deps,tasks,services,h,offer,value};
}
describe('signed QA offer grants and analytics',()=>{
  it('issues BR offers only for authorized preview from GE and binds grants to that session',async()=>{
    const f=await commercialFixture();
    const req=(h:Headers)=>new Request(origin+'/api/commercial/offers',{method:'POST',headers:{...Object.fromEntries(h),origin,'content-type':'application/json'},body:JSON.stringify([context()])});
    const r=await offersRequest(req(f.h),f.services),data=await r.json();expect(data.offers[0].qaPreview).toBe(true);expect(verifyOffer(data.offers[0].token,key)?.qaSession).toBe(previewBinding(f.h));
    expect(JSON.stringify(data)).not.toContain(f.c.destination!);expect(JSON.stringify(data)).not.toContain(f.h.get('cookie')!);
    expect((await (await offersRequest(req(new Headers({'x-vercel-ip-country':'GE'})),f.services)).json()).offers).toEqual([null]);
    expect((await (await offersRequest(req(sessionHeaders(false)),f.services)).json()).offers).toEqual([null]);
  });
  it('opens the approved destination with server-forced QA_TEST; copied grants never unlock ads',async()=>{
    const f=await commercialFixture();f.h.set('sec-fetch-site','same-origin');
    const click=(h:Headers)=>outboundRequest(new Request(origin+f.value.href,{headers:h}),'betsson','slip_bookmaker_comparison',f.services);
    const r=await click(f.h);expect(r.status).toBe(303);expect(r.headers.get('location')).toBe(f.c.destination);
    await f.tasks[0]();expect(f.services.click).toHaveBeenCalledWith(expect.anything(),expect.any(String),'QA_TEST',key);
    await impressionRequest(new Request(origin+'/api/events',{headers:f.h}),{eventId:crypto.randomUUID(),eventName:'affiliate_impression',offer:f.value.token},f.services);
    await f.tasks[1]();expect(f.services.impression).toHaveBeenCalledWith(expect.anything(),expect.any(String),'QA_TEST');
    f.tasks.length=0;
    for(const h of [new Headers({'x-vercel-ip-country':'GE'}),new Headers({'x-vercel-ip-country':'BR'}),sessionHeaders(),sessionHeaders(false)]){const denied=await click(h);expect(denied.headers.get('location')).not.toContain('/owner/preview/click');expect(denied.headers.get('location')).not.toContain('betsson.bet.br');}
    expect(f.tasks).toHaveLength(0);
  });
  it.each(['home_top_banner','home_right_rail','match_odds_table'] as const)('preserves approved destination and campaign/placement attribution for preview %s',async placement=>{
    const f=await commercialFixture();
    const x:CommercialContext=placement==='match_odds_table'?{locale:'br',pagePath:'/br/jogo/home-x-away-abcdef0123456789',placement,bookmaker:'betsson',fixturePublicId:'abcdef0123456789',market:'MATCH_WINNER'}:{locale:'br',pagePath:'/br',placement,bookmaker:'betsson'};
    f.c.placements.push(placement);
    if(placement!=='match_odds_table'){
      f.c.operatorCampaignId='7';f.c.creatives=[{id:'synthetic',locale:'br',placement,imageUrl:null,imageAlt:'Betsson',width:placement==='home_top_banner'?970:300,height:placement==='home_top_banner'?90:250,approved:true,enabled:true,startsAt:null,endsAt:null,delivery:'BETSSON_EMBED',embedSourceUrl:'https://c.bannerflow.net/a/'+'a'.repeat(24)+'?'+new URLSearchParams({display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),redirecturl:'https://record.betsson.bet.br/synthetic-test-only/7',media:'123456',campaign:'7'})}];
    }
    const offer=(await resolveOffer(x,f.deps))!,value=publicOffer(offer,key,Date.now(),'anonymous',previewBinding(f.h));
    const token=verifyOffer(value.token,key)!;
    const fetch=vi.spyOn(globalThis,'fetch');
    const r=await outboundRequest(new Request(origin+value.href,{headers:f.h}),'betsson',placement,f.services);
    expect(r.status).toBe(303);expect(r.headers.get('location')).toBe(f.c.destination);expect(f.tasks).toHaveLength(1);
    await f.tasks[0]();expect(f.services.click).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({campaign:f.c,context:x}),token.viewId,'QA_TEST',key);
    // A delayed event from the old embed cannot create a second click, even
    // after the database's normal ten-second duplicate window has elapsed.
    if(placement!=='match_odds_table'){
      vi.spyOn(Date,'now').mockReturnValue(Date.now()+11000);
      const r=await embedClickRequest(new Request(origin+'/api/events',{method:'POST',headers:{...Object.fromEntries(f.h),origin,'sec-fetch-site':'same-origin'}}),{eventId:crypto.randomUUID(),eventName:'affiliate_embed_click',offer:value.token},f.services);
      expect(r.status).toBe(204);expect(f.tasks).toHaveLength(1);
    }
    expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(value)).not.toContain(f.c.destination!);
  });
  it.each(['disabled','unapproved','wrong-domain','expired-offer','expired-quote','url-override','modified-token'])('keeps the signed preview outbound boundary closed: %s',async change=>{
    const f=await commercialFixture();let href=f.value.href;
    if(change==='disabled')f.c.enabled=false;
    if(change==='unapproved')f.c.approved=false;
    if(change==='wrong-domain')f.c.destination='https://evil.invalid/';
    if(change==='expired-quote')f.deps.pricing=async()=>null;
    if(change==='expired-offer')href=href.split('?')[0]+'?offer='+signOffer({...verifyOffer(f.value.token,key)!,expiresAt:Date.now()-1},key);
    if(change==='url-override')href+='&url=https://evil.invalid';
    if(change==='modified-token')href+='x';
    const r=await outboundRequest(new Request(origin+href,{headers:f.h}),'betsson','slip_bookmaker_comparison',f.services);
    expect(r.headers.get('location')??'').not.toContain('betsson.bet.br');expect(r.headers.get('location')??'').not.toContain('evil.invalid');expect(f.tasks).toHaveLength(0);
  });
  it('preserves the normal BR redirect and keeps unsigned preview legacy links first-party',async()=>{
    const f=await commercialFixture(),value=publicOffer(f.offer,key);
    const normal=new Request(origin+value.href,{headers:{'x-vercel-ip-country':'BR','sec-fetch-user':'?1','sec-fetch-mode':'navigate','sec-fetch-dest':'document','user-agent':'Browser'}});
    expect((await outboundRequest(normal,'betsson','slip_bookmaker_comparison',f.services)).headers.get('location')).toBe(f.c.destination);
    await f.tasks[0]();expect(f.services.click).toHaveBeenCalledWith(expect.objectContaining({campaign:f.c,context:context()}),verifyOffer(value.token,key)!.viewId,'HUMAN_CLICK',key);
    const legacy=await legacyOutbound(new Request(origin+'/go',{headers:f.h}),context(),f.services);
    expect(legacy.headers.get('location')).toBe(origin+'/owner/preview/click');expect(f.tasks).toHaveLength(1);
  });
  it('drops preview product/conversion events before the unclassified production funnel',async()=>{
    for(const eventName of ['affiliate_outbound_click','odds_bookmaker_click','REGISTRATION','FTD']){
      const request=new Request(origin+'/api/events',{method:'POST',headers:{...Object.fromEntries(sessionHeaders()),origin,'content-type':'application/json'},body:JSON.stringify({eventId:crypto.randomUUID(),eventName})});
      const r=await productEvent(request);expect(r.status).toBe(204);expect(r.headers.get('cache-control')).toBe('private, no-store');
    }
  });
  it('requires the owner cookie even on the credentialless creative endpoint',async()=>{
    const f=await commercialFixture(),token=publicOffer({...f.offer,context:{locale:'br',pagePath:'/br',placement:'mobile_inline'},creative:{id:'test',placement:'mobile_inline',locale:'br',imageUrl:null,imageAlt:'test',width:320,height:100,approved:true,enabled:true,startsAt:null,endsAt:null,delivery:'BETSSON_EMBED'}},key,Date.now(),'anonymous',previewBinding(f.h)).token;
    const r=await creativeRequest(new Request(origin+'/api/commercial/creative?offer='+token,{headers:{'sec-fetch-dest':'iframe','sec-fetch-site':'same-origin','x-vercel-ip-country':'GE'}}),f.services);expect(r.status).toBe(404);
  });
});

describe('QA artwork without third-party tracking',()=>{
  const path='accounts/betsson/'+'a'.repeat(24)+'/published/123/'+'b'.repeat(32)+'/preload.jpg';
  const script=(url=path)=>'JSON.parse((r="'+Buffer.from(JSON.stringify({creatives:[{size:{width:320,height:100},image:{url}}]})).toString('base64')+'"';
  it('accepts declarative approved image metadata only and rejects arbitrary remote code, wrong sizes and destinations',()=>{
    expect(approvedImagePath(script(),320,100)).toBe(path);expect(approvedImagePath(script(),970,90)).toBeNull();
    for(const url of ['https://evil.test/a.jpg','../secret','accounts/betsson/x','https://record.betsson.bet.br/test'])expect(approvedImagePath(script(url),320,100)).toBeNull();
    expect(approvedImagePath('process.exit()',320,100)).toBeNull();
  });
  it('embeds only artwork bytes and a first-party event bridge; CSP blocks network and conversions',async()=>{
    const source='https://c.bannerflow.net/a/'+'a'.repeat(24)+'?'+new URLSearchParams({display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),redirecturl:'https://record.betsson.bet.br/synthetic-test-only/7',media:'123456',campaign:'7'});
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(script())).mockResolvedValueOnce(new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}}));
    const r=await qaCreativeDocument({id:'test',placement:'mobile_inline',locale:'br',imageUrl:null,imageAlt:'Betsson',width:320,height:100,approved:true,enabled:true,startsAt:null,endsAt:null,delivery:'BETSSON_EMBED',embedSourceUrl:source},'7',origin,'bridge');
    const body=await r.text();expect(body).toContain('data:image/jpeg;base64,');expect(body).not.toContain('bannerflow.net');expect(body).not.toContain('record.betsson');expect(body).not.toContain('window.open');expect(r.headers.get('content-security-policy')).toContain("connect-src 'none'");expect(fetch).toHaveBeenCalledTimes(2);
  });
});
