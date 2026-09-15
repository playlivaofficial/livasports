import type {FixtureView} from '@/delivery/types';
export type BoardView='all'|'live'|'upcoming'|'results';
export type BoardQuery=Record<string,string|string[]|undefined>;
export function boardDate(value:unknown,today:string,bounds:{from:string;to:string}={from:'1900-01-01',to:`${Number(today.slice(0,4))+2}-12-31`}):string|undefined {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return;
  const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return;
  return value>=bounds.from&&value<=bounds.to?value:undefined;
}
export function boardView(value:unknown,fallback:BoardView='all'):BoardView{return value==='all'||value==='live'||value==='upcoming'||value==='results'?value:fallback;}
export function hasPregameOddsLayout(fixtures:readonly Pick<FixtureView,'status'|'kickoff'>[],now:number):boolean {
  return fixtures.some(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>now);
}
export function matchesView(f:FixtureView,view:BoardView,now:number):boolean {
  if(view==='live')return f.status==='LIVE'||f.status==='HALFTIME';
  if(view==='upcoming')return f.status==='SCHEDULED'&&Date.parse(f.kickoff)>now;
  if(view==='results')return f.status==='FINISHED';
  return true;
}
export function boardSort(a:FixtureView,b:FixtureView,now:number):number {
  const rank=(f:FixtureView)=>matchesView(f,'live',now)?0:matchesView(f,'upcoming',now)?1:f.status==='FINISHED'?3:2;
  return rank(a)-rank(b)||a.kickoff.localeCompare(b.kickoff)||a.id.localeCompare(b.id);
}
