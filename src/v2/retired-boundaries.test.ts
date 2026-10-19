import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as offers from '@/app/api/commercial/offers/route';
import * as creative from '@/app/api/commercial/creative/route';
import * as outbound from '@/app/go/[bookmaker]/route';
import * as placement from '@/app/go/[bookmaker]/[placement]/route';
import * as slip from '@/app/go/slip/[bookmaker]/route';
import * as odds from '@/app/api/odds/[fixtureId]/route';
import * as scheduler from '@/app/api/internal/odds-refresh/route';
import * as ownerCommercial from '@/app/api/owner/commercial/route';
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';

const origin='https://livasports.com';
const calls=vi.hoisted(()=>({database:vi.fn(),fetch:vi.fn()}));
vi.mock('@/database/client',()=>({databaseUrl:calls.database,PostgresDatabaseClient:calls.database}));
const publicRoutes=[
  ['/api/commercial/offers',offers],['/api/commercial/creative',creative],
  ['/go/betsson',outbound],['/go/betsson/v2-home',placement],
  ['/go/slip/betsson',slip],['/api/odds/0123456789abcdef',odds],
] as const;
beforeEach(()=>{
  vi.stubEnv('VERCEL','1');vi.stubEnv('CRON_SECRET','scheduler-test-only');
  vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash('owner-test-only-'.repeat(4)));
  vi.stubEnv('OWNER_QA_SESSION_SECRET','session-test-only-'.repeat(4));
  calls.database.mockClear();calls.fetch.mockClear();vi.stubGlobal('fetch',calls.fetch);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function ownerHeaders(){return {cookie:`${ownerCookie}=${signOwnerSession({...newOwnerSession(),preview:true,previewGeo:'MX'})}`};}

describe('retired V2 HTTP boundaries',()=>{
  it.each(publicRoutes)('%s stays terminal for GET/POST even with signed Owner state',async(path,route)=>{
    for(const method of ['GET','POST'] as const){
      const response=route[method](new Request(origin+path+'?geo=MX&qa=1&offer=untrusted',{
        method,headers:{...ownerHeaders(),'x-vercel-ip-country':'MX','content-type':'application/json'},
        ...(method==='POST'?{body:JSON.stringify({destination:'https://example.invalid/untrusted',enabled:true})}:{}),
      }));
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({state:'RETIRED_IN_V2',providerRequests:0});
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
    expect(calls.database).not.toHaveBeenCalled();expect(calls.fetch).not.toHaveBeenCalled();
  });

  it('keeps authentication on retired scheduler actions without executing work',async()=>{
    for(const method of ['GET','POST'] as const){
      for(const authorization of ['', 'Bearer wrong', 'Bearer scheduler-test-only']){
        const response=scheduler[method](new Request(origin+'/api/internal/odds-refresh',{method,headers:{authorization}}));
        expect(response.status).toBe(authorization==='Bearer scheduler-test-only'?410:401);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.has('location')).toBe(false);
      }
    }
    vi.stubEnv('CRON_SECRET','');
    expect(scheduler.GET(new Request(origin+'/api/internal/odds-refresh',{headers:{authorization:'Bearer scheduler-test-only'}})).status).toBe(401);
    expect(calls.database).not.toHaveBeenCalled();expect(calls.fetch).not.toHaveBeenCalled();
  });

  it('cannot activate through retired Owner controls, including authenticated requests',async()=>{
    for(const method of ['GET','POST'] as const){
      for(const authenticated of [false,true]){
        const response=ownerCommercial[method](new Request(origin+'/api/owner/commercial',{
          method,headers:authenticated?ownerHeaders():{cookie:'owner_preview=MX'},
        }));
        expect(response.status).toBe(authenticated?410:401);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.has('set-cookie')).toBe(false);
      }
    }
    expect(calls.database).not.toHaveBeenCalled();expect(calls.fetch).not.toHaveBeenCalled();
  });
});
