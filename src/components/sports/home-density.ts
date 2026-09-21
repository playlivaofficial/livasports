import type {CompetitionSectionView} from '@/delivery/types';
import {matchesView,boardSort} from './board-policy';
export type HomePeriod='live'|'upcoming'|'tomorrow'|'results';
export function usefulToday(sections:readonly CompetitionSectionView[],now:number){return sections.flatMap(s=>s.fixtures).filter(f=>matchesView(f,'live',now)||matchesView(f,'upcoming',now)).length;}
/** Default home only. Explicit tabs/dates never use this composition. */
export function denseHomeSections(today:readonly CompetitionSectionView[],tomorrow:readonly CompetitionSectionView[],now:number){
  const seen=new Set<string>();const result:Array<CompetitionSectionView&{homePeriod?:HomePeriod}>=[];
  for(const period of ['live','upcoming','tomorrow','results'] as const){
    if(period==='tomorrow'&&usefulToday(today,now)>=4)continue;
    const source=period==='tomorrow'?tomorrow:today;
    for(const section of source){
      const fixtures=section.fixtures.filter(f=>matchesView(f,period==='tomorrow'?'upcoming':period,now)&&!seen.has(f.id)).sort((a,b)=>boardSort(a,b,now));
      for(const fixture of fixtures)seen.add(fixture.id);
      if(fixtures.length)result.push({...section,fixtures,homePeriod:period});
    }
  }
  return result;
}
