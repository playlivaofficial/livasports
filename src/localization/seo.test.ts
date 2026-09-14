import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({connection:async()=>undefined}));
vi.mock('@/match-center/runtime',()=>({loadSitemapMatches:async()=>[{publicId:'0123456789abcdef',home:'Home',away:'Away',updatedAt:new Date('2026-09-01')}],
  loadMatchCenter:async()=>({kind:'found',match:{header:{publicId:'0123456789abcdef',home:{name:'Home'},away:{name:'Away'},competition:'Copa do Brasil'}}})}));
vi.mock('@/profiles/runtime',()=>({loadSitemapTeams:async()=>[{publicId:'1123456789abcdef',name:'Team',updatedAt:new Date('2026-09-01')}],
  loadSitemapPlayers:async()=>[{publicId:'2123456789abcdef',name:'Player',updatedAt:new Date('2026-09-01')}],
  loadTeamProfile:async()=>({kind:'found',profile:{publicId:'1123456789abcdef',name:'Team',indexable:true,imageUrl:null}}),
  loadPlayerProfile:async()=>({kind:'found',profile:{publicId:'2123456789abcdef',name:'Player',indexable:true,imageUrl:null}})}));
import sitemap from '@/app/sitemap';
import {englishMatchMetadata,englishProfileMetadata} from './english-routes';
it('includes every index and entity in all three locales with reciprocal absolute alternates',async()=>{
  const rows=await sitemap();expect(rows).toHaveLength(135);expect(new Set(rows.map(row=>row.url)).size).toBe(135);
  expect(rows.filter(row=>row.url.includes('?competition='))).toHaveLength(102);
  for(const row of rows){const alts=row.alternates?.languages;expect(Object.keys(alts??{})).toEqual(['pt-BR','es-MX','en','x-default']);expect(alts?.['x-default']).toBe(alts?.en);
    for(const url of Object.values(alts??{}))expect(rows.some(item=>item.url===url)).toBe(true);
  }
  expect(rows.find(row=>row.url.includes('/en/team/'))?.lastModified).toEqual(new Date('2026-09-01'));
});
it('English match metadata describes stored sports data in English',async()=>{
  const metadata=await englishMatchMetadata(Promise.resolve({match:'home-x-away-0123456789abcdef'}));
  expect(metadata.description).toContain('Brazil Cup');expect(metadata.other?.['content-language']).toBe('en');
  expect(metadata.alternates?.languages?.['x-default']).toBe(metadata.alternates?.canonical);
});
it.each(['team','player'] as const)('English %s metadata has complete reciprocal entity links',async entity=>{
  const metadata=await englishProfileMetadata(Promise.resolve({profile:'sample-1123456789abcdef'}),entity);
  expect(metadata.description).toContain('Football profiles');expect(metadata.alternates?.languages?.['x-default']).toBe(metadata.alternates?.canonical);
  expect(Object.keys(metadata.alternates?.languages??{})).toHaveLength(4);
});
