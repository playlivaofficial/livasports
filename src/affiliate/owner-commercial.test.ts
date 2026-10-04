import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {activateOperator,parseActivation,ownerCommercialRequest,readCommercialOperators,type ActivationInput} from './owner-commercial';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';
import {requestCommercialGeo} from '@/odds/commercial-geo';
import {campaign,context,dependencies,key} from './fixtures.test-support';
import {publicOffer,resolveOffer} from './service';
import {verifyOffer} from './tokens';

const input=():ActivationInput=>({action:'activate',geo:'CO',operator:'betsson',version:0,affiliateUrl:'https://betsson.co/?campaign=approved-test',campaignId:'approved-test',validFrom:'2026-01-01T00:00:00Z',validUntil:'2099-01-01T00:00:00Z',approvalReference:'Synthetic test approval',confirmedApproval:true});
function database(overrides:Record<string,unknown>={}){
  const row={bookmaker_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',country_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',commercial_version:0,legal_status:'VERIFIED',legal_verified_at:'2026-10-04',legal_reference:'official regulator',mapped:true,sportsbook_enabled:true,odds_enabled:true,comparison_enabled:true,verified_at:'2026-10-04',verification_state:'VERIFIED_CO',source_domains:['betsson.co'],destination_domains:['betsson.co'],...overrides};
  const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT b.id')?[row]:sql.includes('RETURNING id')?[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]:[],rowCount:1}));
  const transaction=vi.fn(async(fn:(q:QueryExecutor)=>Promise<unknown>)=>fn({query} as unknown as QueryExecutor));
  return {db:{query,transaction,close:async()=>{}} as unknown as DatabaseClient,query,transaction};
}
afterEach(()=>vi.unstubAllEnvs());
describe('per-GEO owner activation',()=>{
  it('omits unavailable rows and the historical BR-only feed from the owner candidate pool',async()=>{
    const query=vi.fn<(sql:string)=>Promise<{rows:never[];rowCount:number}>>(async()=>({rows:[],rowCount:0}));await readCommercialOperators({query} as unknown as QueryExecutor);
    expect(query.mock.calls[0]?.[0]).toContain("g.commercial_status<>'UNAVAILABLE'");
    expect(query.mock.calls[0]?.[0]).toContain("b.provider_slug<>'betano.bet.br'");
  });
  it.each(['MX','CO','PE'] as const)('rejects the BR-only feed in %s before any database or campaign mutation',async geo=>{
    const f=database();await expect(activateOperator(f.db,{...input(),geo,operator:'betano.bet.br'},'owner')).rejects.toThrow('OPERATOR_GEO_NOT_CONFIGURED');
    expect(f.query).not.toHaveBeenCalled();expect(f.transaction).not.toHaveBeenCalled();
  });
  it('fails closed for unavailable operator rows before activation or suspension writes',async()=>{
    for(const action of ['activate','suspend'] as const){
      const f=database({commercial_status:'UNAVAILABLE'});
      const value=action==='activate'?input():{action,geo:'CO' as const,operator:'betsson',version:0};
      await expect(activateOperator(f.db,value,'owner')).rejects.toThrow('OPERATOR_GEO_NOT_CONFIGURED');
      expect(f.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
    }
  });
  it('binds every signed grant to the exact activation revision',async()=>{
    const c={...campaign(),commercialVersion:1},deps=dependencies(c),offer=(await resolveOffer(context(),deps))!;
    const grant=verifyOffer(publicOffer(offer,key).token,key)!;expect(grant.campaignVersion).toBe(1);
    expect(await resolveOffer(context(),deps,Date.now(),grant.campaignId,grant.campaignVersion)).not.toBeNull();
    c.commercialVersion=2;
    expect(await resolveOffer(context(),deps,Date.now(),grant.campaignId,grant.campaignVersion)).toBeNull();
    expect(await resolveOffer(context(),deps,Date.now(),grant.campaignId)).toBeNull();
  });
  it.each(['MX','CO','PE'] as const)('will not activate a foreign campaign in %s',async geo=>{
    const c={...campaign(),locale:geo.toLowerCase() as 'mx'|'co'|'pe',operatorDomains:[`betsson.${geo.toLowerCase()}`],domains:[`betsson.${geo.toLowerCase()}`],destination:`https://betsson.${geo.toLowerCase()}/`};
    const deps=dependencies(c),x={...context(),locale:c.locale,pagePath:`/${c.locale}`};
    expect(await resolveOffer(x,deps)).not.toBeNull();
    for(const patch of [{enabled:false},{approved:false},{affiliateApproved:false},{geoEligible:false},{destination:null}])expect(await resolveOffer(x,dependencies({...c,...patch}))).toBeNull();
    for(const foreign of ['MX','CO','PE'].filter(g=>g!==geo))expect(await resolveOffer({...x,locale:foreign.toLowerCase() as 'mx'|'co'|'pe'},deps)).toBeNull();
  });
  it('requires explicit real approval, supported GEO and structured bounded fields',()=>{
    expect(parseActivation(input())).toBeTruthy();
    for(const patch of [{confirmedApproval:false},{geo:'BR'},{geo:'ES'},{version:-1},{extra:true},{affiliateUrl:0},{validUntil:'invalid'},{offer:{unknown:'invented'}}])expect(parseActivation({...input(),...patch})).toBeNull();
  });
  it('atomically activates approved campaign and audit lineage without provider access',async()=>{
    const f=database();const fetch=vi.spyOn(globalThis,'fetch');
    expect(await activateOperator(f.db,input(),'owner-session-hash')).toMatchObject({status:'ACTIVE',geo:'CO',version:1});
    expect(f.transaction).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.some(([sql])=>sql.includes('operator_activation_audit'))).toBe(true);
    expect(f.query.mock.calls.some(([sql])=>sql.includes('operator_domain_allowlist'))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
  it.each([{legal_status:'UNVERIFIED'},{legal_verified_at:null},{legal_reference:null},{legal_reference:'  '},{mapped:false},{sportsbook_enabled:false},{odds_enabled:false},{comparison_enabled:false},{verified_at:null},{verification_state:'VERIFIED_PE'},{verification_state:'GENERIC_UNVERIFIED'},{source_domains:[]}])('rejects incomplete technical or legal prerequisite %j before writes',async patch=>{
    const f=database(patch);await expect(activateOperator(f.db,input(),'owner')).rejects.toThrow('TECHNICAL_OR_LEGAL_VERIFICATION_REQUIRED');expect(f.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  });
  it('rejects stale owner revisions and wrong-country destinations before writes',async()=>{
    for(const [patch,data,error] of [[{commercial_version:2},input(),'CONFIGURATION_CHANGED'],[{}, {...input(),affiliateUrl:'https://betsson.pe/'},'DESTINATION_NOT_ALLOWLISTED']] as const){const f=database(patch);await expect(activateOperator(f.db,data,'owner')).rejects.toThrow(error);expect(f.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);}
  });
  it.each(['http://betsson.co/','https://localhost/','https://127.0.0.1/','https://user:password@betsson.co/','https://betsson.co:8443/','javascript:alert(1)','https://betsson.co.evil.com/','https://betsson.co/%0d%0afoo'])('refuses unsafe destination %s',url=>expect(safeAffiliateDestination('betsson','co',url,['betsson.co'])).toBeNull());
  it('rejects unauthenticated and cross-origin activation',async()=>{
    const db=vi.fn();expect((await ownerCommercialRequest(new Request('https://livasports.com/api/owner/commercial',{method:'POST'}),db)).status).toBe(401);expect(db).not.toHaveBeenCalled();
    vi.stubEnv('OWNER_QA_SESSION_SECRET','s'.repeat(43));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash('k'.repeat(43)));
    const cookie=ownerCookie+'='+signOwnerSession(newOwnerSession());
    expect((await ownerCommercialRequest(new Request('https://livasports.com/api/owner/commercial',{method:'POST',headers:{cookie,origin:'https://evil.com','sec-fetch-site':'cross-site','content-type':'application/json'},body:JSON.stringify(input())}),db)).status).toBe(403);expect(db).not.toHaveBeenCalled();
  });
  it.each(['MX','CO','PE'] as const)('honors only signed %s owner preview and never BR cookies',geo=>{
    const env={VERCEL:'1',OWNER_QA_SESSION_SECRET:'s'.repeat(43),OWNER_QA_ACCESS_HASH:accessKeyHash('k'.repeat(43))};
    const session={...newOwnerSession(),preview:true,previewGeo:geo};const headers=new Headers({cookie:ownerCookie+'='+signOwnerSession(session,env),'x-vercel-ip-country':'GE'});
    expect(requestCommercialGeo(headers,env)).toBe(geo);
    expect(requestCommercialGeo(new Headers({cookie:'geo='+geo,'x-vercel-ip-country':'BR'}),env)).toBeNull();
  });
});
