import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./runtime',()=>({loadTeamHistory:vi.fn()}));
import {loadTeamHistory} from './runtime';
import {TeamHistoryPanel} from './TeamHistoryPanel';
import type {TeamProfileView} from '@/profiles/types';
const profile={publicId:'0123456789abcdef',name:'Club',competitions:[]} as unknown as TeamProfileView;
beforeEach(()=>vi.clearAllMocks());
describe('public team history ISR recovery',()=>{
  it('propagates unavailable data so ISR keeps its prior healthy snapshot',async()=>{
    vi.mocked(loadTeamHistory).mockRejectedValue(new Error('DATABASE_UNAVAILABLE'));
    await expect(TeamHistoryPanel({profile,locale:'mx'})).rejects.toThrow('DATABASE_UNAVAILABLE');
  });
  it('accepts an honestly empty successful result and keeps the long public TTL',async()=>{
    const initial={rows:[],hasNext:false};vi.mocked(loadTeamHistory).mockResolvedValue(initial);
    const result=await TeamHistoryPanel({profile,locale:'mx'});
    expect(loadTeamHistory).toHaveBeenCalledWith(profile.publicId,'mx','results',1,undefined,3600);
    expect(result.props.initial).toEqual(initial);expect(result.props.failed).toBeUndefined();
  });
});
