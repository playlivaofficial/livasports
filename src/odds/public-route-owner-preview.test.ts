import {describe,it,expect,vi,afterEach} from 'vitest';
import {GET} from '@/app/api/odds/[fixtureId]/route';
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';
afterEach(()=>vi.unstubAllEnvs());
describe('Owner preview cannot reactivate retired live odds',()=>{
 it.each(['MX','CO','PE'] as const)('preserves signed %s preview without retrieving prices',async geo=>{
  vi.stubEnv('OWNER_QA_SESSION_SECRET','test-only-session-material-'.repeat(3));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash('test-only-access-material-'.repeat(3)));
  const token=signOwnerSession({...newOwnerSession(),preview:true,previewGeo:geo});
  const response=await GET(new Request('https://livasports.com/api/odds/0123456789abcdef',{headers:{cookie:ownerCookie+'='+token}}));
  expect(response.status).toBe(410);const text=await response.text();expect(text).toContain('"providerRequests":0');expect(text).not.toContain(token);expect(response.headers.has('set-cookie')).toBe(false);
 });
});
