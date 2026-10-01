import {describe,it,expect,vi} from 'vitest';
const load=vi.hoisted(()=>vi.fn());
vi.mock('@/sports/runtime',()=>({loadCompetition:load}));
import {GET} from '@/app/api/sports/standings/[slug]/route';
describe('DB-only latest standings API',()=>{
 it('returns the latest shared public read model, freshness and zero provider requests',async()=>{
  for(const points of [12,15]){load.mockResolvedValue({id:'competition',season:{id:'season'},standings:[{position:1,played:5,points}],standingsFreshness:{snapshotVersion:points}});
   const response=await GET(new Request('https://livasports.com/api/sports/standings/premier-league'),{params:Promise.resolve({slug:'premier-league'})});
   expect(response.headers.get('Cache-Control')).toBe('no-store');expect(await response.json()).toMatchObject({standings:[{position:1,played:5,points}],providerRequests:0,freshness:{snapshotVersion:points}});
  }
 });
 it.each(['br','en','mx'])('preserves %s locale',async locale=>{load.mockResolvedValue(null);await GET(new Request(`https://livasports.com/api/sports/standings/liga-mx?locale=${locale}`),{params:Promise.resolve({slug:'liga-mx'})});expect(load).toHaveBeenLastCalledWith('liga-mx',locale,undefined,1);});
 it('rejects invalid season parameters',async()=>expect((await GET(new Request('https://livasports.com/api/sports/standings/x?season=invalid'),{params:Promise.resolve({slug:'x'})})).status).toBe(400));
 it('returns unavailable instead of fabricating standings on DB failure',async()=>{load.mockRejectedValue(Error('private database detail'));const response=await GET(new Request('https://livasports.com/api/sports/standings/x'),{params:Promise.resolve({slug:'x'})});expect(response.status).toBe(503);expect(await response.text()).not.toContain('private database');});
});
