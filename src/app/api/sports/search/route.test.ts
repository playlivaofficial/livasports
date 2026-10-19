import {describe,it,expect,vi,afterEach} from 'vitest';
import {GET} from './route';
afterEach(()=>vi.restoreAllMocks());
describe('retired paid-data sports search',()=>{
 it.each(['br','mx','co','pe','en','invalid'])('does not query a provider for %s; editorial search is local',async locale=>{
  const fetch=vi.spyOn(globalThis,'fetch');const response=await GET(new Request('https://livasports.com/api/sports/search?q=test&locale='+locale));
  expect(response.status).toBe(410);expect(await response.json()).toEqual({state:'RETIRED_IN_V2',providerRequests:0});expect(fetch).not.toHaveBeenCalled();
 });
});
