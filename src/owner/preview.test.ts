import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {accessKeyHash,authorizedOwnerKey,newOwnerSession,ownerCookie,previewBinding,requestOwnerSession,signOwnerSession} from './session';
import {ownerAction,ownerStatus} from './server';
import {requestCommercialGeo,requestCountry} from '@/odds/commercial-geo';
import {geoAllowed} from '@/affiliate/policy';
import {offersRequest,outboundRequest,impressionRequest,creativeRequest,type CommercialServices} from '@/affiliate/server';
import {campaign,context,dependencies,key} from '@/affiliate/fixtures.test-support';
import {publicOffer,resolveOffer} from '@/affiliate/service';
import {verifyOffer} from '@/affiliate/tokens';
import {approvedImagePath,qaCreativeDocument} from './creative';

const access='q'.repeat(43),origin='https://livasports.com';
const sessionHeaders=(preview=true)=>new Headers({'cookie':ownerCookie+'='+signOwnerSession({...newOwnerSession(),preview}),'x-vercel-ip-country':'GE'});
const post=(body:unknown,headers:HeadersInit={})=>new Request(origin+'/api/owner/preview',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json',...Object.fromEntries(new Headers(headers))},body:JSON.stringify(body)});
beforeEach(()=>{vi.stubEnv('VERCEL','1');vi.stubEnv('OWNER_QA_SESSION_SECRET','s'.repeat(43));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash(access));vi.stubEnv('AFFILIATE_ANALYTICS_MODE','anonymous');});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('owner authentication and GEO isolation',()=>{
  it('authenticates only the dedicated high entropy owner key and signs an off-by-default secure session',async()=>{
    expect(authorizedOwnerKey(access)).toBe(true);expect(authorizedOwnerKey('wrong')).toBe(false);
    expect((await ownerAction(post({action:'login',key:'wrong'}))).status).toBe(401);
    const r=await ownerAction(post({action:'login',key:access})),cookie=r.headers.get('set-cookie')!;
    expect(r.status).toBe(200);expect(await r.json()).toEqual({authorized:true,preview:false});
    for(const flag of ['__Host-','Secure','HttpOnly','SameSite=Strict','Path=/','Max-Age='])expect(cookie).toContain(flag);
    expect(cookie).not.toContain(access);expect(r.headers.get('cache-control')).toBe('private, no-store');
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
  it('forces QA_TEST server-side and issues only a first-party confirmation; copied grants never unlock ads',async()=>{
    const f=await commercialFixture();f.h.set('sec-fetch-site','same-origin');
    const click=(h:Headers)=>outboundRequest(new Request(origin+f.value.href,{headers:h}),'betsson','slip_bookmaker_comparison',f.services);
    const r=await click(f.h);expect(r.status).toBe(303);expect(r.headers.get('location')).toBe(origin+'/owner/preview/click');
    await f.tasks[0]();expect(f.services.click).toHaveBeenCalledWith(expect.anything(),expect.any(String),'QA_TEST',key);
    await impressionRequest(new Request(origin+'/api/events',{headers:f.h}),{eventId:crypto.randomUUID(),eventName:'affiliate_impression',offer:f.value.token},f.services);
    await f.tasks[1]();expect(f.services.impression).toHaveBeenCalledWith(expect.anything(),expect.any(String),'QA_TEST');
    f.tasks.length=0;
    for(const h of [new Headers({'x-vercel-ip-country':'GE'}),new Headers({'x-vercel-ip-country':'BR'}),sessionHeaders(),sessionHeaders(false)]){const denied=await click(h);expect(denied.headers.get('location')).not.toContain('/owner/preview/click');expect(denied.headers.get('location')).not.toContain('betsson.bet.br');}
    expect(f.tasks).toHaveLength(0);
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
