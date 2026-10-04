import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({
  header:vi.fn(),load:vi.fn(),headers:vi.fn(),cached:vi.fn(),
}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({headers:f.headers}));
vi.mock('next/cache',()=>({unstable_cache:(read:()=>unknown,key:string[],options:unknown)=>{f.cached(key,options);return read;}}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class{}}));
vi.mock('./repository',()=>({PostgresMatchCenterRepository:class{header=f.header;}}));
vi.mock('./loader',()=>({MatchCenterLoader:class{load=f.load;}}));
vi.mock('@/odds/commercial-geo',()=>({requestCommercialGeo:()=>null}));
import {loadPublicMatchCenter} from './runtime';

describe('public match shell request isolation',()=>{
  beforeEach(()=>{vi.clearAllMocks();f.load.mockResolvedValue({kind:'found',match:{oddsComparisons:[]}});});
  it.each(['br','mx','co','pe'] as const)('keeps the %s shell isolated from request GEO and odds',async locale=>{
    const header={id:'fixture-id',status:'FINISHED',kickoff:'2020-01-01T12:00:00Z',competitionId:'league-id'};
    f.header.mockResolvedValue(header);
    const value=await loadPublicMatchCenter('aaaaaaaaaaaaaaaa',locale);
    expect(value).toMatchObject({kind:'found',match:{oddsComparisons:[]}});
    expect(f.headers).not.toHaveBeenCalled();
    expect(f.load).toHaveBeenCalledWith('aaaaaaaaaaaaaaaa',locale,null,{header,includeOdds:false,strictPublicSnapshot:true});
    expect(f.cached).toHaveBeenCalledWith(['public-match-shell-v1','aaaaaaaaaaaaaaaa',locale,'FINISHED'],{
      revalidate:86400,tags:['livasports:v1:fixture:aaaaaaaaaaaaaaaa','livasports:v1:fixture:fixture-id'],
    });
    expect(JSON.stringify(f.cached.mock.calls)).not.toContain('fixtures:br');
    expect(JSON.stringify(f.cached.mock.calls)).not.toContain('standings:league-id');
  });
  it('retains immediate shared standings invalidation on upcoming pages only',async()=>{
    f.header.mockResolvedValue({id:'upcoming-id',status:'SCHEDULED',kickoff:'2090-01-01T12:00:00Z',competitionId:'league-id'});
    await loadPublicMatchCenter('cccccccccccccccc','br');
    expect(f.cached.mock.calls[0][1]).toMatchObject({revalidate:300,tags:expect.arrayContaining(['standings:league-id'])});
  });
  it('does not permanently cache a missing fixture',async()=>{
    f.header.mockResolvedValue(null);f.load.mockResolvedValue({kind:'not-found'});
    await expect(loadPublicMatchCenter('bbbbbbbbbbbbbbbb','br')).resolves.toEqual({kind:'not-found'});
    expect(f.cached.mock.calls[0][1]).toMatchObject({revalidate:300});
  });
  it('propagates regeneration failure to ISR instead of caching a partial success',async()=>{
    f.header.mockResolvedValue({id:'fixture-id',status:'FINISHED',kickoff:'2020-01-01T12:00:00Z',competitionId:'league-id'});
    f.load.mockRejectedValueOnce(new Error('PUBLIC_MATCH_SNAPSHOT_UNAVAILABLE'));
    await expect(loadPublicMatchCenter('dddddddddddddddd','br')).rejects.toThrow('PUBLIC_MATCH_SNAPSHOT_UNAVAILABLE');
  });
});
