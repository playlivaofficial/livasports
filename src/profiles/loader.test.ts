import { describe, expect, it, vi } from 'vitest';
import { CacheCoordinator, MemoryCacheStore } from '@/cache/cache';
import type { TeamProfileView, PlayerProfileView } from './types';
import { ProfileLoader } from './loader';

vi.mock('server-only',()=>({}));

const emptyModule = {state:'NOT_YET_INGESTED' as const,data:[],providerUpdatedAt:null,lastSuccessfulRefreshAt:null};
const team:TeamProfileView={entityType:'TEAM',id:'team',publicId:'0123456789abcdef',locale:'br',name:'Flamengo',shortName:null,
  imageUrl:null,country:'Brazil',foundedYear:null,venue:null,venueCity:null,coach:null,competitions:[],upcoming:[],recent:[],
  standings:emptyModule,squad:emptyModule,statistics:emptyModule,lastModifiedAt:'2026-09-12T00:00:00.000Z',indexable:true,providerRequests:0};
const player:PlayerProfileView={entityType:'PLAYER',id:'player',publicId:'fedcba9876543210',locale:'br',name:'Jogador',commonName:null,
  imageUrl:null,nationality:null,country:null,position:null,detailedPosition:null,dateOfBirth:null,heightCm:null,weightKg:null,
  currentTeam:null,contexts:[],statistics:emptyModule,matches:emptyModule,lastModifiedAt:'2026-09-12T00:00:00.000Z',indexable:false,providerRequests:0};

describe('profile cache-first read path', () => {
  it('reads each team/player once, then serves cache with zero provider requests', async () => {
    let teamReads=0,playerReads=0;
    const repository={team:async()=>{teamReads++;return team;},player:async()=>{playerReads++;return player;}};
    const loader=new ProfileLoader(repository as never,new CacheCoordinator(new MemoryCacheStore()));
    expect((await loader.team(team.publicId,'br')).kind).toBe('found');
    expect((await loader.team(team.publicId,'br')).kind).toBe('found');
    expect((await loader.player(player.publicId,'br')).kind).toBe('found');
    expect((await loader.player(player.publicId,'br')).kind).toBe('found');
    expect({teamReads,playerReads}).toEqual({teamReads:1,playerReads:1});
    expect(team.providerRequests).toBe(0); expect(player.providerRequests).toBe(0);
  });

  it('propagates database errors rather than converting them into false 404s', async () => {
    const repository={team:async()=>{throw new Error('database unavailable');},player:async()=>null};
    const loader=new ProfileLoader(repository as never,new CacheCoordinator(new MemoryCacheStore()));
    await expect(loader.team(team.publicId,'br')).rejects.toThrow('database unavailable');
  });

  it('gives public profile shells long TTLs without invalidating them on every unrelated odds tick',async()=>{
    const getOrSet=vi.fn(async(_key:string,_options:unknown,load:()=>Promise<unknown>)=>({value:await load()}));
    const loader=new ProfileLoader({team:async()=>team,player:async()=>player} as never,{getOrSet} as never);
    await loader.team(team.publicId,'br');await loader.player(player.publicId,'br');
    expect(getOrSet.mock.calls[0][1]).toMatchObject({ttlSeconds:3600,tags:[expect.stringContaining(':profile:team:')]});
    expect(getOrSet.mock.calls[1][1]).toMatchObject({ttlSeconds:21600,tags:[expect.stringContaining(':profile:player:')]});
    expect(JSON.stringify(getOrSet.mock.calls.map(call=>call[1]))).not.toContain('fixtures:');
  });
});
