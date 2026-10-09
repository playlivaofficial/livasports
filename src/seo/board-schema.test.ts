import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {footballBoardSchema} from './structured-data';
import {interfaceLocales,interfaceRoutes,languageTags} from '@/localization/interface';
describe('factual football-board schema',()=>{
 it.each(interfaceLocales)('%s preserves regional identity without inventing events or offers',locale=>{
  for(const page of ['home','football','live','today'] as const){
   const [board,breadcrumb]=footballBoardSchema(locale,page);
   expect(board).toMatchObject({'@type':'CollectionPage',url:'https://livasports.com'+interfaceRoutes[locale][page],inLanguage:languageTags[locale]});
   if(page==='home')expect(breadcrumb).toBeUndefined();
   else{expect(breadcrumb['@type']).toBe('BreadcrumbList');expect(breadcrumb).toHaveProperty('itemListElement',expect.arrayContaining([expect.objectContaining({position:1}),expect.objectContaining({position:2})]));}
   const json=JSON.stringify([board,breadcrumb]);expect(()=>JSON.parse(json)).not.toThrow();expect(json).not.toMatch(/SportsEvent|offers|aggregateRating|BroadcastEvent/);
  }
 });
});
