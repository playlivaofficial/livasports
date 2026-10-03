import {isSpanishLocale} from '@/config/geo';
import type {InterfaceLocale} from '@/localization/interface';
import type {SportsStanding} from './types';
type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v&&typeof v==='object'?v as Row:{};
const list=(v:unknown):Row[]=>Array.isArray(v)?v as Row[]:[];
const value=(v:unknown)=>typeof v==='number'?v:typeof v==='string'&&v.trim()&&Number.isFinite(Number(v))?Number(v):null;
export function standingExtras(raw:Row):Pick<SportsStanding,'form'|'rule'|'home'|'away'>{
  const details=list(raw.provider_details);
  const side=(offset:number,points:number)=>{
    const metric=(id:number)=>value(details.find(d=>d.type_id===id)?.value);
    const gf=metric(offset+4),ga=metric(offset+5);
    return {played:metric(offset),won:metric(offset+1),drawn:metric(offset+2),lost:metric(offset+3),goalsFor:gf,goalsAgainst:ga,goalDifference:gf!==null&&ga!==null?gf-ga:null,points:metric(points)};
  };
  return {form:list(raw.provider_form).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)).slice(-5).map(r=>String(r.form)).filter(r=>['W','D','L'].includes(r)),rule:value(obj(raw.provider_rule).type_id),home:side(135,185),away:side(141,186)};
}
// Labels follow provider rule type IDs, never league position assumptions.
export function standingRule(locale:InterfaceLocale,id:number|null):{label:string;tone:string}|null{
  const common:Record<number,[string,string,string,string]>={
    147:['Acesso','Ascenso','Promotion','qualification'],
    168:['Oitavas de final','Octavos de final','Round of 16','qualification'],
    180:['Champions League','Champions League','Champions League','qualification'],
    181:['Liga Europa','Europa League','Europa League','qualification'],
    182:['Rebaixamento','Descenso','Relegation','relegation'],
    246:['Pré-Champions League','Clasificatorias de Champions League','Champions League qualifiers','qualification'],
    249:['Eliminatória contra o rebaixamento','Eliminatoria por la permanencia','Relegation play-off','relegation'],
    256:['Semifinais','Semifinales','Semi-finals','qualification'],
    264:['Eliminatória de acesso','Eliminatoria de ascenso','Promotion play-off','qualification'],
    265:['Pré-Liga Europa','Clasificatorias de Europa League','Europa League qualifiers','qualification'],
    266:['Eliminatória intermediária','Eliminatoria intermedia','Middle play-off','qualification'],
    268:['Libertadores','Libertadores','Libertadores','qualification'],
    269:['Eliminatórias da fase final','Eliminatorias de la fase final','Final series play-offs','qualification'],
    275:['Quartas de final','Cuartos de final','Quarter-finals','qualification'],
    278:['Eliminatória','Eliminatoria','Play-off','qualification'],
    279:['Fase final','Fase final','Final series','qualification'],
    284:['Champions League da Ásia','Champions League de Asia','AFC Champions League','qualification'],
    286:['Pré-Libertadores','Clasificatorias de Libertadores','Libertadores qualifiers','qualification'],
    287:['Sul-Americana','Sudamericana','Sudamericana','qualification'],
    289:['Pré-Conference League','Clasificatorias de Conference League','Conference League qualifiers','qualification'],
    293:['Eliminatórias da Liga Conferência','Eliminatorias de la Liga Conferencia','UEFA Conference League play-offs','qualification'],
    298:['16 avos de final','Dieciseisavos de final','Round of 32','qualification'],
    299:['Eliminatória da pré-Conference League','Eliminatoria clasificatoria de Conference League','Conference League qualifying play-off','qualification'],
    307:['Eliminatórias','Eliminatorias','Play-offs','qualification'],
    1493:['Eliminatórias da Liga Europa','Eliminatorias de Europa League','Europa League play-offs','qualification'],
  };
  const row=id===null?undefined:common[id];return row?{label:row[locale==='br'?0:isSpanishLocale(locale)?1:2],tone:row[3]}:null;
}
