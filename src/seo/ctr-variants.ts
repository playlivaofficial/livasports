import type {MatchCenterView} from '@/match-center/types';
import type {InterfaceLocale} from '@/localization/interface';
import {matchCompetitionLabel} from '@/sports/match-seo';

/** Explicit Sept 28 GSC cohort, not a daily title generator. Do not expand without new BEFORE evidence. */
export const CTR_EXPERIMENT_KEY='seo-ctr-2026-09-28';
export const CTR_MATCHES=[
  {publicId:'031d1cbb143b458e',locale:'mx',intent:'lineups'},
  {publicId:'b1ae5b99e0da4a89',locale:'mx',intent:'lineups'},
  {publicId:'698c745b81534512',locale:'br',intent:'standings'},
] as const;
export const CTR_TEAMS=['e8daf455a06c4578','02c2411f3e9941a7'] as const;

export function ctrMatchMetadata(locale:InterfaceLocale,match:Pick<MatchCenterView,'header'|'lineups'|'standings'>){
  const h=match.header,choice=CTR_MATCHES.find(row=>row.publicId===h.publicId&&row.locale===locale);
  // The selected cohort is finished. A real status correction or missing module is a factual defect,
  // not a reason to continue promising the old state just to keep an experiment stable.
  if(!choice||h.status!=='FINISHED')return null;
  const lineup=match.lineups.data.some(team=>team.starters.length>0);
  const standings=match.standings.data.length>0;
  if(choice.intent==='lineups'&&!lineup||choice.intent==='standings'&&!standings)return null;
  const teams=`${h.home.name} ${locale==='br'?'x':'vs.'} ${h.away.name}`,competition=matchCompetitionLabel(locale,h);
  if(locale==='mx')return {title:`${teams}: alineaciones`,
    description:`Alineaciones de ${h.home.name} contra ${h.away.name} en ${competition}. Consulta los titulares y suplentes registrados y el resultado final.`,
    intro:`${competition}: consulta las alineaciones registradas y el resultado de este partido finalizado.`,
    anchor:'#lineups',label:'Ver alineaciones'};
  return {title:`${teams}: classificação`,
    description:`${teams} pela ${competition}: resultado da partida e classificação disponível da competição. Consulte também os dados registrados do jogo.`,
    intro:`${competition}: resultado do jogo e classificação disponível da competição. A tabela não é uma reconstrução da rodada da partida.`,
    anchor:'#standings',label:'Ver classificação'};
}

export function ctrTeamMetadata(locale:InterfaceLocale,publicId:string,name:string){
  if(locale!=='br'||!CTR_TEAMS.some(id=>id===publicId))return null;
  return {title:`${name}: jogos e resultados`,
    description:`Confira os jogos e resultados do ${name}. Veja o calendário disponível, os adversários e os dados do clube no LivaSports.`};
}
