import {afterEach,describe,expect,it,vi} from 'vitest';
const {loadOddsComparisons}=vi.hoisted(()=>({loadOddsComparisons:vi.fn(async()=>[])}));
vi.mock('server-only',()=>({}));
vi.mock('@/odds/runtime',()=>({loadOddsComparisons}));
import {GET} from '@/app/api/odds/[fixtureId]/route';
import {ownerCookie,signOwnerSession} from '@/owner/session';

afterEach(()=>{vi.unstubAllEnvs();loadOddsComparisons.mockClear();});
describe('private owner preview over a cached public match route',()=>{
  it.each(['MX','CO','PE'] as const)('keeps signed owner %s preview private and independent of the cached page locale',async previewGeo=>{
    vi.stubEnv('VERCEL','1');
    vi.stubEnv('OWNER_QA_SESSION_SECRET','test-only-owner-preview-secret-not-used-outside-tests');
    vi.stubEnv('OWNER_QA_ACCESS_HASH','a'.repeat(64));
    const token=signOwnerSession({v:1,id:'o'.repeat(32),expiresAt:Date.now()+60_000,preview:true,previewGeo});
    const response=await GET(new Request('https://livasports.com/api/odds/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?locale=br',{
      headers:{'x-vercel-ip-country':'US',cookie:`${ownerCookie}=${token}`},
    }),{params:Promise.resolve({fixtureId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'})});
    expect(loadOddsComparisons).toHaveBeenCalledWith('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',previewGeo);
    expect((await response.json()).commercialLocale).toBe(previewGeo.toLowerCase());
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
