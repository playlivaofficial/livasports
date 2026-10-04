import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const db=vi.hoisted(()=>({query:vi.fn(),match:vi.fn()}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class{query=db.query;}}));
vi.mock('@/match-center/runtime',()=>({loadPublicMatchCenter:db.match}));
vi.mock('@/sports/runtime',async()=>{
  const {SportsRepository}=await import('@/sports/repository');
  const repository=new SportsRepository({query:db.query});
  return {loadPendingFixture:(id:string)=>repository.pending(id)};
});
vi.mock('@/components/sports/SiteHeader',()=>({SiteHeader:()=>null}));
vi.mock('@/localization/time-zone-server',()=>({requestTimeZone:async()=> 'UTC'}));
vi.mock('@/sports/SportsLink',()=>({default:({children,...props}:import('react').ComponentProps<'a'>)=><a {...props}>{children}</a>}));
import {renderToStaticMarkup} from 'react-dom/server';
import {unstable_doesMiddlewareMatch as unstable_doesProxyMatch} from 'next/experimental/testing/server';
import {config} from '@/proxy';
import {PendingMatch,pendingMetadata,pendingPath} from '@/sports/PendingMatch';
import type {PendingSportsFixture} from '@/sports/types';
import {interfaceLocales,languageTags,matchPath,type InterfaceLocale} from './interface';
import {matchMetadata,MatchRoutePage} from '@/match-center/page';
import {englishMatchMetadata,EnglishMatchRoute} from './english-routes';
import {LocalizedNotFound} from './LocalizedNotFound';

const id='0123456789abcdef';
const row:PendingSportsFixture={publicId:id,kickoff:null,round:null,stage:null,competitionSlug:'copa-colombia',seasonId:'season',season:'2026',home:null,away:null};
const params=(path:string)=>Promise.resolve({match:path.split('/').at(-1)!});
const readMetadata=(locale:InterfaceLocale,path:string)=>locale==='en'?englishMatchMetadata(params(path)):matchMetadata(params(path),locale);
const readPage=(locale:InterfaceLocale,path:string)=>locale==='en'?EnglishMatchRoute({params:params(path)}):MatchRoutePage({params:params(path),locale});
beforeEach(()=>{db.query.mockReset();db.match.mockReset();db.match.mockResolvedValue({kind:'not-found'});});
describe('pending fixture routes remain canonical, localized and noindex',()=>{
  it.each(interfaceLocales)('%s pending canonical reaches the existing fallback without a placeholder redirect loop',async locale=>{
    db.query.mockResolvedValue({rows:[{public_id:id,kickoff:null,round_name:null,stage_name:null,slug:row.competitionSlug,season_id:row.seasonId,season_name:row.season,home_name:null,away_name:null}]});
    const path=pendingPath(locale,id);
    expect(unstable_doesProxyMatch({config,nextConfig:{},url:path})).toBe(false);
    const metadata=await readMetadata(locale,path);
    expect(metadata).toEqual(pendingMetadata(locale,row));
    expect(metadata.alternates).toEqual({canonical:path});expect(metadata.robots).toEqual({index:false,follow:true});
    const page=await readPage(locale,path);
    expect(page.type).toBe(PendingMatch);expect(page.props).toMatchObject({locale,row});
    const [sql,args]=db.query.mock.calls[0];expect(sql).toContain('FROM sports_pending_fixtures');expect(sql).toContain('c.enabled');expect(args).toEqual([id]);
    expect(db.match).toHaveBeenCalledWith(id,locale==='en'?'br':locale);
  });
  it.each(['co','pe'] as const)('%s true missing entities return localized 404 and never invent a fixture',async locale=>{
    db.query.mockResolvedValue({rows:[]});const path=pendingPath(locale,id);
    await expect(readMetadata(locale,path)).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
    await expect(readPage(locale,path)).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
    const html=renderToStaticMarkup(<LocalizedNotFound locale={locale}/>);expect(html).toContain(`lang="${languageTags[locale]}"`);expect(html).toContain('Página no encontrada');
    expect(html).toContain(`href="/${locale}/futbol"`);
  });
  it('a confirmed fixture still gets a permanent cosmetic-slug redirect',async()=>{
    db.match.mockResolvedValue({kind:'found',match:{header:{publicId:id,home:{name:'América'},away:{name:'Toluca'}}}});
    await expect(readPage('co','/co/partido/old-name-'+id)).rejects.toMatchObject({digest:`NEXT_REDIRECT;replace;${matchPath('co',id,'América','Toluca')};308;`});
    expect(db.query).not.toHaveBeenCalled();
  });
  it.each(['co','pe'] as const)('%s renders factual pending details in Spanish without fake teams/time',async locale=>{
    const html=renderToStaticMarkup(await PendingMatch({locale,row}));expect(html).toContain('Equipos por definir');expect(html).toContain('aún esperan confirmación');
    expect(html).not.toContain('Teams to be confirmed');expect(html).not.toContain('<time');expect(html).toContain(`/${locale}/futbol?competition=copa-colombia`);
  });
});
