import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({connection:async()=>undefined}));
vi.mock('@/sports/sitemap-runtime',()=>({loadCompetitionSitemapSummaries:vi.fn(async()=>[{slug:'premier-league',seasonId:'11111111-1111-4111-8111-111111111111',upcoming:3,results:10,standings:true,scorers:true,teams:true,updatedAt:new Date('2026-09-17T13:15:13Z')}])}));
vi.mock('@/match-center/runtime',()=>({
  loadPublicMatchCenter:vi.fn(async(publicId:string)=>({kind:'found',match:{header:{publicId,home:{name:'Home'},away:{name:'Away'},competition:'Copa do Brasil'}}}))}));
vi.mock('@/profiles/runtime',()=>({
  loadTeamProfile:vi.fn(async()=>({kind:'found',profile:{publicId:'1123456789abcdef',name:'Team',indexable:true,imageUrl:null}})),
  loadPlayerProfile:async()=>({kind:'found',profile:{publicId:'2123456789abcdef',name:'Player',indexable:true,imageUrl:null}})}));
import {GET as sitemapRoute} from '@/app/sitemap.xml/route';
import {loadCompetitionSitemapSummaries} from '@/sports/sitemap-runtime';
import {primarySitemap} from '@/seo/sitemap';
import {sitemapXmlProblems} from '@/sports/sitemap';
import {englishMatchMetadata,englishProfileMetadata} from './english-routes';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
it('lists every hub, document and competition entry in all three locales with reciprocal absolute alternates',async()=>{
  const rows=primarySitemap(null);
  const competitions=FOOTBALL_COMPETITION_TARGETS.filter(c=>c.enabled).length;
  // 4 hubs + 4 legal + 3 help + competitions, each in three locales; entities live only in /sports-sitemaps.xml.
  expect(rows).toHaveLength((4+4+3+competitions)*3);expect(new Set(rows.map(row=>row.url)).size).toBe(rows.length);
  expect(rows.filter(row=>row.url.includes('?competition='))).toHaveLength(competitions*3);
  expect(rows.some(row=>/\/(match|jogo|partido|team|time|equipo|player|jogador|jugador)\//.test(row.url))).toBe(false);
  for(const row of rows){const alts=row.alternates?.languages;expect(Object.keys(alts??{})).toEqual(['pt-BR','es-MX','en','x-default']);expect(alts?.['x-default']).toBe(alts?.en);
    expect(Object.values(alts??{})).toContain(row.url);
    for(const url of Object.values(alts??{}))expect(rows.some(item=>item.url===url)).toBe(true);
  }
  expect(rows.find(row=>row.url==='https://livasports.com/br')?.lastModified).toBeUndefined();
  expect(rows.find(row=>row.url==='https://livasports.com/en/how-odds-comparison-works')?.lastModified).toBeInstanceOf(Date);
});
it('English match metadata describes stored sports data in English',async()=>{
  const metadata=await englishMatchMetadata(Promise.resolve({match:'home-x-away-0123456789abcdef'}));
  expect(metadata.description).toContain('Brazil Cup');expect(metadata.other?.['content-language']).toBe('en');
  expect(metadata.alternates?.languages?.['x-default']).toBe(metadata.alternates?.canonical);
});
it.each(['team','player'] as const)('English %s metadata has complete reciprocal entity links',async entity=>{
  const metadata=await englishProfileMetadata(Promise.resolve({profile:entity==='team'?'team-1123456789abcdef':'player-2123456789abcdef'}),entity);
  expect(metadata.description).toContain('Football profiles');expect(metadata.alternates?.languages?.['x-default']).toBe(metadata.alternates?.canonical);
  expect(Object.keys(metadata.alternates?.languages??{})).toHaveLength(4);
});
it('a thin (noindex) profile keeps its canonical but emits no hreflang cluster',async()=>{
  const {loadTeamProfile}=await import('@/profiles/runtime');
  vi.mocked(loadTeamProfile).mockResolvedValueOnce({kind:'found',profile:{publicId:'1123456789abcdef',name:'Team',indexable:false,imageUrl:null}} as never);
  const metadata=await englishProfileMetadata(Promise.resolve({profile:'team-1123456789abcdef'}),'team');
  expect(metadata.robots).toEqual({index:false,follow:true});expect(metadata.alternates?.canonical).toBe('/en/team/team-1123456789abcdef');expect(metadata.alternates?.languages).toBeUndefined();
});
it('/sitemap.xml is served as well-formed, escaped XML with the correct content type (Search Console parsing error regression)',async()=>{
  const response=await sitemapRoute();
  expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
  expect(response.headers.get('cache-control')).toContain('s-maxage');
  const body=await response.text();
  expect(sitemapXmlProblems(body)).toEqual([]);
  expect(body).toContain('competition=premier-league&amp;tab=results</loc>');
  expect(body).not.toMatch(/&tab=/);
  // M1: the served document matches the sitemap built from the same coverage summaries — only the
  // covered competition is submitted, so the registry's other hubs no longer spend index budget.
  expect(body.match(/<url>/g)).toHaveLength(primarySitemap(await loadCompetitionSitemapSummaries()).length);
  expect(body.match(/<loc>[^<]*\?competition=/g)).toHaveLength(5*3);
  expect(body).not.toContain('competition=la-liga');
});

describe('M1 finished-match decay in metadata',()=>{
  const ago=(days:number)=>new Date(Date.now()-days*86_400_000).toISOString();
  const serve=async(publicId:string,status:string,kickoff:string)=>{
    const {loadPublicMatchCenter}=await import('@/match-center/runtime');
    vi.mocked(loadPublicMatchCenter).mockResolvedValue({kind:'found',match:{header:{publicId,home:{name:'Home'},away:{name:'Away'},
      competition:'Copa do Brasil',competitionSlug:'copa-do-brasil',season:'2026',status,kickoff}}} as never);
    return englishMatchMetadata(Promise.resolve({match:`home-x-away-${publicId}`}));
  };
  it('an aged-out finished match keeps its canonical, drops hreflang and stops asking to be indexed',async()=>{
    const metadata=await serve('00000000000000a1','FINISHED',ago(120));
    expect(metadata.robots).toEqual({index:false,follow:true});
    expect(metadata.alternates?.canonical).toBe('/en/match/home-x-away-00000000000000a1');
    expect(metadata.alternates?.languages).toBeUndefined();
  });
  it('a recent finished match stays indexable with the full reciprocal cluster',async()=>{
    const metadata=await serve('00000000000000a2','FINISHED',ago(5));
    expect(metadata.robots).toBeUndefined();
    expect(Object.keys(metadata.alternates?.languages??{})).toEqual(['pt-BR','es-MX','en','x-default']);
    expect(metadata.title).toContain('Result and stats');
  });
  it('an upcoming match is never decayed on age and carries odds intent',async()=>{
    const metadata=await serve('00000000000000a3','SCHEDULED',ago(-10));
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toContain('Odds and stats');
    // The en route names the competition in English and appends the stored season.
    expect(metadata.title).toContain('Brazil Cup 2026');
  });
  it('an old postponed fixture is not retired, because it can still be rescheduled',async()=>{
    expect((await serve('00000000000000a4','POSTPONED',ago(400))).robots).toBeUndefined();
  });
});
