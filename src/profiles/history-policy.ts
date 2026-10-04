import {sportsPage,sportsSeason} from '@/sports/policy';
import type {TeamProfileView} from './types';

export type TeamHistoryProfile=Pick<TeamProfileView,'publicId'|'name'|'competitions'>;
export interface TeamHistorySelection {view:'fixtures'|'results';page:number;season?:string;}

/** Only known profile seasons may reach the database; arbitrary query keys are discarded. */
export function teamHistorySelection(profile:TeamHistoryProfile,query:URLSearchParams):TeamHistorySelection{
  const requested=sportsSeason(query.get('season'));
  return {view:query.get('matches')==='fixtures'?'fixtures':'results',page:sportsPage(query.get('p')),
    ...(requested&&profile.competitions.some(row=>row.seasonId===requested)?{season:requested}:{})};
}
export function teamHistoryKey(selection:TeamHistorySelection){return `${selection.view}:${selection.page}:${selection.season??'all'}`;}
