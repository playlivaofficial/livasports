import {describe,it,expect,vi} from 'vitest';
const {loadOddsComparisons}=vi.hoisted(()=>({loadOddsComparisons:vi.fn(async()=>[])}));
vi.mock('server-only',()=>({}));
vi.mock('@/odds/runtime',()=>({loadOddsComparisons}));
import {GET} from './route';

describe('public odds read route',()=>{
  it('returns providerRequests 0 and never fetches an upstream provider',async()=>{
    const fetchSpy=vi.spyOn(globalThis,'fetch');
    const response=await GET(new Request('https://livasports.com/api/odds/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?locale=br'),{params:Promise.resolve({fixtureId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'})});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({comparisons:[],providerRequests:0});
    expect(loadOddsComparisons).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
