import type {CompetitionSectionView} from '@/delivery/types';
import {boardSort} from './board-policy';
export type HomePeriod='live'|'upcoming'|'tomorrow'|'results';
export const HOME_WINDOW_DAYS=7;
/**
 * Default home (no explicit view/date/competition): the next seven local calendar days, today included.
 * Live first, then upcoming chronologically, finished last inside a competition; competitions ordered by first kickoff.
 * Yesterday's results (part of the football window) are excluded so a first-time visitor lands on what is coming.
 * Explicit tabs/dates never use this composition.
 */
export function weekHomeSections(sections:readonly CompetitionSectionView[],window:{from:number;to:number},now:number){
  return sections.map(section=>({...section,fixtures:section.fixtures.filter(f=>{const t=Date.parse(f.kickoff);return t>=window.from&&t<window.to;}).sort((a,b)=>boardSort(a,b,now))}))
    .filter(section=>section.fixtures.length)
    .sort((a,b)=>a.priority-b.priority||Math.min(...a.fixtures.map(f=>Date.parse(f.kickoff)))-Math.min(...b.fixtures.map(f=>Date.parse(f.kickoff)))||a.competition.localeCompare(b.competition));
}
