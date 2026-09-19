import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/security/request-limit',()=>({requestLimit:async()=>null}));
vi.mock('@/database/client',()=>({databaseUrl:()=>'postgres://local',PostgresDatabaseClient:class{query=vi.fn();close=vi.fn();}}));
vi.mock('@/sports/repository',()=>({SportsRepository:class{
  search=vi.fn(async(query:string)=>query==='bra'?[
    {kind:'competition',publicId:'brasileirao-serie-a',name:'Brasileirão Série A',context:null,slug:'brasileirao-serie-a',countryCode:'BR',imageUrl:null},
    {kind:'team',publicId:'braga',name:'Braga',context:'Portugal',slug:null,countryCode:'PT',imageUrl:null},
  ]:[]);
}}));
import {GET} from './route';

describe('sports autocomplete API',()=>{
  it('returns at most five DB-only suggestions with providerRequests 0',async()=>{
    const fetchSpy=vi.spyOn(globalThis,'fetch');
    const response=await GET(new Request('https://livasports.com/api/sports/search?locale=br&q=bra'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({suggestions:[
      {kind:'competition',publicId:'brasileirao-serie-a',name:'Brasileirão Série A',context:null,slug:'brasileirao-serie-a',countryCode:'BR',imageUrl:null},
      {kind:'team',publicId:'braga',name:'Braga',context:'Portugal',slug:null,countryCode:'PT',imageUrl:null},
    ],providerRequests:0});
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it('rejects an unknown locale without querying',async()=>{
    expect((await GET(new Request('https://livasports.com/api/sports/search?locale=fr&q=bra'))).status).toBe(400);
  });
});
