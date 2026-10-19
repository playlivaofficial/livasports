import {afterEach,describe,it,expect,vi} from 'vitest';
import {GET} from './route';
afterEach(()=>vi.restoreAllMocks());
describe('retired live bookmaker-price endpoint',()=>{
 it.each(['MX','CO','PE','BR','US','GE',''])('cannot serve or request prices for %s',async geo=>{
  const fetch=vi.spyOn(globalThis,'fetch');
  const response=await GET(new Request('https://livasports.com/api/odds/0123456789abcdef?locale=mx',{headers:{'x-vercel-ip-country':geo,cookie:'commercialGeo=MX; owner_preview=MX'}}));
  expect(response.status).toBe(410);expect(await response.json()).toEqual({state:'RETIRED_IN_V2',providerRequests:0});
  expect(fetch).not.toHaveBeenCalled();expect(response.headers.get('x-robots-tag')).toContain('noindex');expect(response.headers.has('set-cookie')).toBe(false);
 });
});
