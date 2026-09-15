import type {InterfaceLocale} from '@/localization/interface';
import type {SportsScorer,SportsStanding,SportsTeam} from './types';
import {standingExtras} from './standing-policy';
type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:null;
const number=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export const unlinkedTeamLabel=(locale:InterfaceLocale)=>locale==='br'?'Time não informado pela fonte':locale==='mx'?'Equipo no informado por la fuente':'Team not supplied by the source';
const knownTeam=(r:Row):SportsTeam|null=>r.team_id&&r.team_public_id&&r.team_name?{id:String(r.team_id),publicId:String(r.team_public_id),name:String(r.team_name),imageUrl:text(r.team_image_url)}:null;
/** Only display source facts. Missing entities have no public ID and cannot become profile links. */
export function unlinkedStanding(r:Row):SportsStanding{
  const p=object(r.payload),details=Array.isArray(p.details)?p.details as Row[]:[];
  const metric=(id:number)=>number(details.find(d=>d.type_id===id)?.value),gf=metric(133),ga=metric(134);
  return {team:knownTeam(r),sourceKey:`unlinked-standing:${r.provider_record_id}`,stage:text(object(p.stage).name),group:text(object(p.group).name),position:Number(p.position),played:metric(129),won:metric(130),drawn:metric(131),lost:metric(132),goalsFor:gf,goalsAgainst:ga,goalDifference:gf!==null&&ga!==null?gf-ga:null,points:number(p.points),updatedAt:r.observed_at?new Date(String(r.observed_at)).toISOString():null,...standingExtras({provider_details:p.details,provider_form:p.form,provider_rule:p.rule})};
}
export function unlinkedScorers(rows:Row[],locale:InterfaceLocale):SportsScorer[]{
  const groups=new Map<string,Row[]>();
  for(const r of rows){const key=JSON.stringify([r.provider_player_id,r.provider_participant_id]);groups.set(key,[...(groups.get(key)??[]),r]);}
  return [...groups.values()].flatMap(group=>{
    const goal=group.find(r=>Number(object(r.payload).type_id)===208),goals=number(object(goal?.payload).total);
    if(!goal||goals===null||goals<=0)return [];
    const assist=group.find(r=>Number(object(r.payload).type_id)===209);
    return [{publicId:text(goal.player_public_id),sourceKey:`unlinked-scorer:${goal.provider_record_id}`,name:text(goal.player_name)??text(object(object(goal.payload).player).display_name)??(locale==='br'?'Jogador não informado pela fonte':locale==='mx'?'Jugador no informado por la fuente':'Player not supplied by the source'),team:knownTeam(goal),nationality:null,countryCode:null,goals,assists:assist?number(object(assist.payload).total):null,appearances:null,minutes:null,rank:0}];
  });
}
