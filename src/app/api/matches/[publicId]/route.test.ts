import {describe,it,expect,vi,afterEach} from 'vitest';
import {GET} from './route';
const snapshot=vi.hoisted(()=>vi.fn());
vi.mock('@/match-center/runtime',()=>({loadLiveSnapshot:snapshot}));
afterEach(()=>vi.restoreAllMocks());
describe('retired live snapshot boundary',()=>{
 it.each(['br','mx','co','pe','en'])('never refreshes a %s live snapshot',async locale=>{
  const fetch=vi.spyOn(globalThis,'fetch');
  const response=await GET(new Request('https://livasports.com/api/matches/0123456789abcdef?locale='+locale),{params:Promise.resolve({publicId:'0123456789abcdef'})});
  expect(response.status).toBe(410);expect(await response.json()).toEqual({state:'RETIRED_IN_V2',providerRequests:0});
  expect(response.headers.has('set-cookie')).toBe(false);expect(snapshot).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('does not revive an endpoint for arbitrary identities or query parameters',()=>{expect(GET(new Request('https://livasports.com/api/matches/invalid?refresh=1')).status).toBe(410);});
});
