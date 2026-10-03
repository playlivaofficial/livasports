import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class{query=db.query;}}));
vi.mock('@/components/sports/SiteHeader',()=>({SiteHeader:()=>null}));
vi.mock('@/localization/time-zone-server',()=>({requestTimeZone:async()=> 'UTC'}));
vi.mock('@/sports/SportsLink',()=>({default:({children,...props}:import('react').ComponentProps<'a'>)=><a {...props}>{children}</a>}));
import {NextRequest} from 'next/server';
import {renderToStaticMarkup} from 'react-dom/server';
import {proxy} from '@/proxy';
import {PendingMatch,pendingMetadata,pendingPath} from '@/sports/PendingMatch';
import type {PendingSportsFixture} from '@/sports/types';
import {interfaceLocales,languageTags,matchPath} from './interface';

const id='0123456789abcdef';
const row:PendingSportsFixture={publicId:id,kickoff:null,round:null,stage:null,competitionSlug:'copa-colombia',seasonId:'season',season:'2026',home:null,away:null};
beforeEach(()=>db.query.mockReset());
describe('pending fixture routes remain canonical, localized and noindex',()=>{
  it.each(interfaceLocales)('%s pending canonical reaches the existing fallback without a placeholder redirect loop',async locale=>{
    db.query.mockResolvedValue({rows:[{public_id:id,home:'fixture',away:'pending'}]});
    const path=pendingPath(locale,id),response=await proxy(new NextRequest('https://livasports.com'+path));
    expect(response.status).toBe(200);expect(response.headers.get('location')).toBeNull();
    const [sql,args]=db.query.mock.calls[0];expect(sql).toContain('FROM sports_pending_fixtures');expect(sql).toContain('AND NOT EXISTS');expect(args).toEqual([id]);
    const metadata=pendingMetadata(locale,row);expect(metadata.alternates).toEqual({canonical:path});expect(metadata.robots).toEqual({index:false,follow:true});
  });
  it.each(['co','pe'] as const)('%s true missing entities return localized 404 and never invent a fixture',async locale=>{
    db.query.mockResolvedValue({rows:[]});const response=await proxy(new NextRequest('https://livasports.com'+pendingPath(locale,id)));
    expect(response.status).toBe(404);const html=await response.text();expect(html).toContain(`lang="${languageTags[locale]}"`);expect(html).toContain('Partido no encontrado');
    expect(html).toContain(`href="/${locale}/futbol"`);
  });
  it('a confirmed fixture still gets a permanent cosmetic-slug redirect',async()=>{
    db.query.mockResolvedValue({rows:[{public_id:id,home:'América',away:'Toluca'}]});
    const response=await proxy(new NextRequest('https://livasports.com/co/partido/old-name-'+id));
    expect(response.status).toBe(308);expect(response.headers.get('location')).toBe('https://livasports.com'+matchPath('co',id,'América','Toluca'));
  });
  it.each(['co','pe'] as const)('%s renders factual pending details in Spanish without fake teams/time',async locale=>{
    const html=renderToStaticMarkup(await PendingMatch({locale,row}));expect(html).toContain('Equipos por definir');expect(html).toContain('aún esperan confirmación');
    expect(html).not.toContain('Teams to be confirmed');expect(html).not.toContain('<time');expect(html).toContain(`/${locale}/futbol?competition=copa-colombia`);
  });
});
