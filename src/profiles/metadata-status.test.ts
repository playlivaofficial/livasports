import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/profiles/runtime',()=>({loadTeamProfile:vi.fn(),loadPlayerProfile:vi.fn()}));
import {loadPlayerProfile,loadTeamProfile} from './runtime';
import {profileMetadata,ProfileRoutePage} from './page';
import {englishProfileMetadata,EnglishProfileRoute} from '@/localization/english-routes';
import type {InterfaceLocale} from '@/localization/interface';
const id='0123456789abcdef';
beforeEach(()=>{
  vi.clearAllMocks();
  const result={kind:'found',profile:{publicId:id,name:'São Paulo',indexable:true,imageUrl:null}} as never;
  vi.mocked(loadTeamProfile).mockResolvedValue(result);vi.mocked(loadPlayerProfile).mockResolvedValue(result);
});
const metadata=(locale:InterfaceLocale,entity:'team'|'player',param:string)=>locale==='en'?englishProfileMetadata(Promise.resolve({profile:param}),entity):profileMetadata(Promise.resolve({profile:param}),locale,entity);
const page=(locale:InterfaceLocale,entity:'team'|'player',param:string)=>locale==='en'?EnglishProfileRoute({params:Promise.resolve({profile:param}),entity}):ProfileRoutePage({params:Promise.resolve({profile:param}),locale,entity});

describe('profile status resolves before the streaming boundary',()=>{
  it.each(['br','mx','co','pe','en'] as const)('%s malformed profile yields a real metadata 404 without a database lookup',async locale=>{
    await expect(metadata(locale,'team','bad')).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
    expect(loadTeamProfile).not.toHaveBeenCalled();expect(loadPlayerProfile).not.toHaveBeenCalled();
  });
  it.each(['br','mx','co','pe','en'] as const)('%s missing recorded entity yields metadata 404 rather than a soft-200 page',async locale=>{
    vi.mocked(loadTeamProfile).mockResolvedValue({kind:'not-found'});vi.mocked(loadPlayerProfile).mockResolvedValue({kind:'not-found'});
    for(const entity of ['team','player'] as const)await expect(metadata(locale,entity,`unknown-${id}`)).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
  });
  it.each([['br','team','time'],['mx','team','equipo'],['co','team','equipo'],['pe','team','equipo'],['en','team','team'],['br','player','jogador'],['mx','player','jugador'],['co','player','jugador'],['pe','player','jugador'],['en','player','player']] as const)('%s %s page emits one canonical 308 while metadata only supplies canonical links',async(locale,entity,segment)=>{
    for(const param of [`wrong-${id}`,`SAO-PAULO-${id.toUpperCase()}`]){
      expect((await metadata(locale,entity,param)).alternates?.canonical).toBe(`/${locale}/${segment}/sao-paulo-${id}`);
      await expect(page(locale,entity,param)).rejects.toMatchObject({digest:`NEXT_REDIRECT;replace;/${locale}/${segment}/sao-paulo-${id};308;`});
    }
    const result=await metadata(locale,entity,`sao-paulo-${id}`);
    expect(result.alternates?.canonical).toBe(`/${locale}/${segment}/sao-paulo-${id}`);
    const spanishSegment=entity==='team'?'equipo':'jugador';
    expect(result.alternates?.languages).toMatchObject({'es-MX':`/mx/${spanishSegment}/sao-paulo-${id}`,'es-CO':`/co/${spanishSegment}/sao-paulo-${id}`,'es-PE':`/pe/${spanishSegment}/sao-paulo-${id}`});
    expect(result.robots).toEqual({index:true,follow:true});
  });
});
