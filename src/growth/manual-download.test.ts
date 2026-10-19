import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/owner/session',()=>({requestOwnerSession:vi.fn()}));
import {requestOwnerSession} from '@/owner/session';
import {GET} from '@/app/api/owner/growth/items/[id]/video/[channel]/route';
beforeEach(()=>vi.clearAllMocks());
describe('retired video download boundary preserves stored media',()=>{
 it.each(['TIKTOK','INSTAGRAM','YOUTUBE'])('returns explicit retirement for authorized %s without storage writes',async channel=>{
  vi.mocked(requestOwnerSession).mockReturnValue({id:'owner'} as never);
  const fetch=vi.spyOn(globalThis,'fetch');const response=await GET(new Request('https://livasports.com/api/owner/growth/items/test/video/'+channel));
  expect(response.status).toBe(410);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.json()).toEqual({state:'RETIRED_IN_V2',providerRequests:0});expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
 });
 it('still denies anonymous callers',async()=>{vi.mocked(requestOwnerSession).mockReturnValue(null);expect(GET(new Request('https://livasports.com/api/owner/growth/items/test/video/TIKTOK')).status).toBe(401);});
});
