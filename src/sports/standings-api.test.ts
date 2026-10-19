import {describe,it,expect,vi,afterEach} from 'vitest';
import {GET} from '@/app/api/sports/standings/[slug]/route';
afterEach(()=>vi.restoreAllMocks());
describe('retired standings endpoint',()=>{
 it.each(['br','mx','co','pe','en'])('does not misrepresent a stored table as current for %s',async locale=>{
  const fetch=vi.spyOn(globalThis,'fetch');const response=await GET(new Request('https://livasports.com/api/sports/standings/liga-mx?locale='+locale));
  expect(response.status).toBe(410);expect(await response.json()).toEqual({state:'RETIRED_IN_V2',providerRequests:0});expect(fetch).not.toHaveBeenCalled();
 });
 it('is terminal even for a refresh override',()=>{expect(GET(new Request('https://livasports.com/api/sports/standings/liga-mx?refresh=true')).status).toBe(410);});
});
