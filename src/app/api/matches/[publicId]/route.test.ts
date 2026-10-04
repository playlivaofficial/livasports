import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({snapshot:vi.fn()}));
vi.mock('@/match-center/runtime',()=>({loadMatchSnapshot:f.snapshot}));
import {GET} from './route';

const publicId='0123456789abcdef';
const params=()=>Promise.resolve({publicId});
describe('private live snapshot over the public ISR shell',()=>{
  beforeEach(()=>{vi.clearAllMocks();f.snapshot.mockResolvedValue({kind:'found',match:{
    header:{publicId,status:'LIVE',providerUpdatedAt:'2026-10-04T12:00:00Z'},snapshotAt:'2026-10-04T11:59:00Z',
  }});});
  it.each(['br','mx','co','pe'] as const)('uses the %s sports locale without loading commercial odds',async locale=>{
    const response=await GET(new Request(`https://livasports.com/api/matches/${publicId}?locale=${locale}`),{params:params()});
    expect(f.snapshot).toHaveBeenCalledWith(publicId,locale);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({publicId,status:'LIVE',providerUpdatedAt:'2026-10-04T12:00:00Z',snapshotAt:'2026-10-04T11:59:00Z',providerRequests:0});
  });
  it('preserves a bounded unavailable response instead of leaking errors',async()=>{
    f.snapshot.mockRejectedValue(new Error('private database details'));
    const response=await GET(new Request(`https://livasports.com/api/matches/${publicId}?locale=pe`),{params:params()});
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({error:'temporarily_unavailable'});
  });
});
