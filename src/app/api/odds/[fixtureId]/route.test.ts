import {describe,it,expect,vi} from 'vitest';
const {loadOddsComparisons}=vi.hoisted(()=>({loadOddsComparisons:vi.fn(async()=>[])}));
vi.mock('server-only',()=>({}));
vi.mock('@/odds/runtime',()=>({loadOddsComparisons}));
import {GET} from './route';

describe('public odds read route',()=>{
  it('returns providerRequests 0 and never fetches an upstream provider',async()=>{
    const fetchSpy=vi.spyOn(globalThis,'fetch');
    const response=await GET(new Request('https://livasports.com/api/odds/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?locale=en'),{params:Promise.resolve({fixtureId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'})});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({comparisons:[],commercialLocale:null,providerRequests:0});
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(loadOddsComparisons).toHaveBeenCalledWith('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps English locale as presentation and uses trusted request GEO for eligibility',async()=>{
    vi.stubEnv('VERCEL','1');
    for(const locale of ['br','mx','en'] as const){
      loadOddsComparisons.mockClear();
      const response=await GET(new Request(`https://livasports.com/api/odds/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?locale=${locale}`,{headers:{'x-vercel-ip-country':'BR'}}),{params:Promise.resolve({fixtureId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'})});
      expect(response.status).toBe(200);
      expect(loadOddsComparisons).toHaveBeenCalledWith('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','BR');
      expect((await response.json()).commercialLocale).toBe('br');
    }
    vi.unstubAllEnvs();
  });

  it('does not derive a commercial country from a cached URL locale',async()=>{
    vi.stubEnv('VERCEL','1');
    for(const country of ['MX','CO','PE','US']){
      const response=await GET(new Request('https://livasports.com/api/odds/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?locale=br',{headers:{'x-vercel-ip-country':country}}),{params:Promise.resolve({fixtureId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'})});
      expect((await response.json()).commercialLocale).toBe(country==='MX'?'mx':null);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    vi.unstubAllEnvs();
  });
});
