import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const {odds}=vi.hoisted(()=>({odds:vi.fn(async()=>[])}));
vi.mock('@/odds/runtime',()=>({loadOddsComparisons:odds}));
import {CacheCoordinator,MemoryCacheStore} from '@/cache/cache';
import {FixtureStatus} from '@/domain/enums';
import {MatchCenterLoader} from './loader';
import type {PostgresMatchCenterRepository} from './repository';
import type {MatchHeaderView} from './types';

describe('public canonical match facts without commercial reads',()=>{
  it('actually skips odds repository work while preserving every sports module',async()=>{
    const header={id:'fixture',publicId:'aaaaaaaaaaaaaaaa',status:FixtureStatus.FINISHED,providerUpdatedAt:null,
      kickoff:'2020-01-01T12:00:00Z',competitionType:'DOMESTIC_LEAGUE'} as MatchHeaderView;
    const repo={header:vi.fn(async()=>header),moduleStates:vi.fn(async()=>({})),events:vi.fn(async()=>[]),
      statistics:vi.fn(async()=>[]),lineups:vi.fn(async()=>[]),playerPerformances:vi.fn(async()=>[]),
      standings:vi.fn(async()=>[]),form:vi.fn(async()=>({home:[],away:[],headToHead:[]})),nextMatches:vi.fn(async()=>[])};
    const loader=new MatchCenterLoader(repo as unknown as PostgresMatchCenterRepository,new CacheCoordinator(new MemoryCacheStore()));
    odds.mockClear();
    const publicResult=await loader.load(header.publicId,'mx',null,{header,includeOdds:false,strictPublicSnapshot:true});
    expect(publicResult).toMatchObject({kind:'found',match:{header,oddsComparisons:[],providerRequests:0}});
    expect(odds).not.toHaveBeenCalled();
    for(const name of ['moduleStates','events','statistics','lineups','playerPerformances','standings','form','nextMatches'] as const){
      expect(repo[name]).toHaveBeenCalledOnce();
    }
    expect(repo.header).not.toHaveBeenCalled();
    await loader.load(header.publicId,'mx','MX');
    expect(odds).toHaveBeenCalledWith('fixture','MX');
  });

  it.each(['events','statistics','lineups','playerPerformances','standings','form','nextMatches'] as const)(
    'does not replace good ISR data when %s fails, but keeps the legacy private fallback',async failed=>{
      const header={id:'fixture',publicId:'aaaaaaaaaaaaaaaa',status:FixtureStatus.FINISHED,providerUpdatedAt:null,
        kickoff:'2020-01-01T12:00:00Z',competitionType:'DOMESTIC_LEAGUE'} as MatchHeaderView;
      const repo={header:vi.fn(async()=>header),moduleStates:vi.fn(async()=>({
        EVENTS:{state:'NOT_COVERED',providerUpdatedAt:null,lastSuccessfulRefreshAt:null,snapshotAt:null},
      })),events:vi.fn(async()=>[]),statistics:vi.fn(async()=>[]),lineups:vi.fn(async()=>[]),
        playerPerformances:vi.fn(async()=>[]),standings:vi.fn(async()=>[]),
        form:vi.fn(async()=>({home:[],away:[],headToHead:[]})),nextMatches:vi.fn(async()=>[])};
      repo[failed].mockRejectedValue(new Error('private database detail'));
      const loader=()=>new MatchCenterLoader(repo as unknown as PostgresMatchCenterRepository,new CacheCoordinator(new MemoryCacheStore()));
      await expect(loader().load(header.publicId,'br',null,{header,includeOdds:false,strictPublicSnapshot:true}))
        .rejects.toThrow('PUBLIC_MATCH_SNAPSHOT_UNAVAILABLE');
      const legacy=await loader().load(header.publicId,'br',null,{header,includeOdds:false});
      expect(legacy.kind).toBe('found');
    });

  it('accepts truthful unavailable and empty modules in strict public snapshots',async()=>{
    const header={id:'fixture',publicId:'aaaaaaaaaaaaaaaa',status:FixtureStatus.SCHEDULED,providerUpdatedAt:null,
      kickoff:'2090-01-01T12:00:00Z',competitionType:'DOMESTIC_LEAGUE'} as MatchHeaderView;
    const repo={header:async()=>header,moduleStates:async()=>({
      EVENTS:{state:'NOT_COVERED',providerUpdatedAt:null,lastSuccessfulRefreshAt:null,snapshotAt:null},
    }),events:async()=>[],statistics:async()=>[],lineups:async()=>[],playerPerformances:async()=>[],
      standings:async()=>[],form:async()=>({home:[],away:[],headToHead:[]}),nextMatches:async()=>[]};
    const loader=new MatchCenterLoader(repo as unknown as PostgresMatchCenterRepository,new CacheCoordinator(new MemoryCacheStore()));
    const result=await loader.load(header.publicId,'br',null,{header,includeOdds:false,strictPublicSnapshot:true});
    expect(result).toMatchObject({kind:'found',match:{events:{state:'NOT_COVERED',data:[]},lineups:{state:'NOT_YET_AVAILABLE',data:[]}}});
  });
});
