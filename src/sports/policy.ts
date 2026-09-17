import {interfaceRoutes,type InterfaceLocale} from '@/localization/interface';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {englishCompetition} from '@/localization/sports-copy';
export const competitionTabs=['fixtures','results','standings','scorers','teams'] as const;
export type CompetitionTab=typeof competitionTabs[number];
export const sportsPageSize=30;
export function competitionTab(value:unknown):CompetitionTab{return competitionTabs.includes(value as CompetitionTab)?value as CompetitionTab:'fixtures';}
export function sportsPage(value:unknown){const n=typeof value==='string'&&/^\d{1,4}$/.test(value)?Number(value):1;return Math.max(1,Math.min(1000,n));}
export function sportsSeason(value:unknown){return typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)?value:undefined;}
export function sportsQuery(value:unknown){return typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80):'';}
export function competitionPath(locale:InterfaceLocale,slug:string,options:{tab?:CompetitionTab;season?:string;page?:number}={}){
  const query=new URLSearchParams({competition:slug});
  if(options.tab&&options.tab!=='fixtures')query.set('tab',options.tab);
  if(options.season)query.set('season',options.season);
  if(options.page&&options.page>1)query.set('p',String(options.page));
  return `${interfaceRoutes[locale].football}?${query}`;
}
/** Season a hub resolves without ?season: the first ordered season, unless the source verified it empty and an older season has fixtures. */
export function resolveDefaultSeason<T extends {fixtures:number;verifiedEmpty?:boolean}>(seasons:readonly T[]):T|null{
  const first=seasons[0]??null;
  if(first&&first.fixtures===0&&first.verifiedEmpty===true)return seasons.find(s=>s.fixtures>0)??first;
  return first;
}
export function competitionName(locale:InterfaceLocale,slug:string){const target=FOOTBALL_COMPETITION_TARGETS.find(t=>t.slug===slug);return target?(locale==='en'?englishCompetition(target.canonicalName):target.displayNames[locale]):null;}
export function numericStatistic(value:unknown):number|null{
  const raw=value&&typeof value==='object'?(value as Record<string,unknown>).total:undefined;
  if(typeof raw!=='number'&&typeof raw!=='string')return null;
  if(raw==='')return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?n:null;
}
export function sportGroup(locale:InterfaceLocale,value:string|null):string|null{
  if(!value)return null;
  const conferences:Record<string,[string,string,string]>={
    'Eastern Conference':['Conferência Leste','Conferencia Este','Eastern Conference'],
    'Western Conference':['Conferência Oeste','Conferencia Oeste','Western Conference'],
  };
  if(conferences[value])return conferences[value][locale==='br'?0:locale==='mx'?1:2];
  const suffix=value.replace(/^(Group|Grupo)\s+/i,'').trim();
  if(/^[A-Z0-9]+$/.test(suffix))return `${locale==='en'?'Group':'Grupo'} ${suffix}`;
  return locale==='en'?value:null;
}
export function sportStage(locale:InterfaceLocale,value:string|null):string|null{
  if(!value)return null;
  // Apertura/Clausura are official tournament names; localize their Spanish phase names.
  if(/^Reclasificaci[oó]n$/.test(value))return locale==='br'?'Repescagem':locale==='mx'?'Reclasificación':'Qualification play-off';
  if(locale==='en')return value.split(' - ').map(part=>/^Reclasificaci[oó]n$/.test(part)?'Qualification play-off':part).join(' - ');
  const historical:Record<string,[string,string]>={
    '16th Finals':['16 avos de final','Dieciseisavos de final'],
    'Finals':['Finais','Finales'],
    'Championship':['Disputa do título','Fase por el título'],
    'Knockout Round Play-offs':['Eliminatórias do mata-mata','Eliminatorias de la fase final'],
    'Promotion Play-offs':['Eliminatórias de acesso','Eliminatorias de ascenso'],
    'Relegation Play-offs':['Eliminatórias contra o rebaixamento','Eliminatorias por la permanencia'],
    'Relegation Round':['Fase contra o rebaixamento','Fase por la permanencia'],
    'Qualifying Round':['Fase classificatória','Ronda clasificatoria'],
    'Qualifying':['Fase classificatória','Fase clasificatoria'],
    'Paulista Série A1':['Paulista A1','Paulista A1'],
    'Taça Rio':['Taça Rio','Taça Rio'],
    'Conference League Play-offs':['Eliminatórias para a Liga Conferência','Eliminatorias para la Liga Conferencia'],
    'MLS Cup':['Copa MLS','Copa MLS'],
    'Conference Finals':['Finais de conferência','Finales de conferencia'],
    'Conference Semi-finals':['Semifinais de conferência','Semifinales de conferencia'],
    'Play-In Round':['Repescagem','Repechaje'],
    'Best of 3':['Melhor de 3','Al mejor de 3'],
    'Quarterfinals':['Quartas de final','Cuartos de final'],
    'Taça Guanabara':['Taça Guanabara','Taça Guanabara'],
    'Round of 32':['16 avos de final','Dieciseisavos de final'],
    'Round of 64':['32 avos de final','Treintaidosavos de final'],
    'Play-offs Round':['Eliminatórias','Eliminatorias'],
  };
  if(historical[value])return historical[value][locale==='br'?0:1];
  const parts=value.split(' - ');
  if(parts.length>1){const translated=parts.map(part=>sportStage(locale,part));return translated.every(Boolean)?translated.join(' · '):null;}
  const phase=/^(\d+)(?:st|nd|rd|th) Phase$/.exec(value);
  if(phase)return `${phase[1]}ª fase`;
  const groupStage=/^(\d+)(?:st|nd|rd|th) Group Stage$/.exec(value);
  if(groupStage)return `${groupStage[1]}ª fase de grupos`;
  const qualification=/^Qualification Round (\d+)$/.exec(value);
  if(qualification)return `${qualification[1]}ª ${locale==='br'?'fase classificatória':'ronda clasificatoria'}`;
  const numbered=/^Round (\d+)$/.exec(value);
  if(numbered)return `${numbered[1]}ª ${locale==='br'?'fase':'ronda'}`;
  const labels:Record<string,[string,string]>={'Regular Season':['Temporada regular','Temporada regular'],'Quarter-finals':['Quartas de final','Cuartos de final'],'Semi-finals':['Semifinais','Semifinales'],'Final':['Final','Final'],'Group Stage':['Fase de grupos','Fase de grupos'],'Group stage':['Fase de grupos','Fase de grupos'],'Play-off Round':['Eliminatórias','Eliminatorias'],'Round of 16':['Oitavas de final','Octavos de final'],'8th Finals':['Oitavas de final','Octavos de final'],'Play-offs':['Eliminatórias','Eliminatorias'],'League Stage':['Fase de liga','Fase de liga'],'Preliminary Round':['Fase preliminar','Ronda preliminar'],'Extra Preliminary Round':['Fase pré-preliminar','Ronda preliminar extra'],'Preliminary Round Replays':['Desempates da fase preliminar','Desempates de la ronda preliminar'],'Extra Preliminary Round Replays':['Desempates da fase pré-preliminar','Desempates de la ronda preliminar extra']};
  const round=/^(\d+)(?:st|nd|rd|th) (Round|Qualifying Round|Round Qualifying)( Replays)?$/.exec(value);
  if(round){const qualification=round[2]!=='Round';return `${round[1]}ª ${locale==='br'?'fase':'ronda'}${qualification?(locale==='br'?' classificatória':' clasificatoria'):''}${round[3]?(locale==='br'?' · desempates':' · desempates'):''}`;}
  return labels[value]?.[locale==='br'?0:1]??(/^[\d\s/.-]+$/.test(value)||/^(Apertura|Clausura)/i.test(value)?value:null);
}

/** Official draw labels are translated, never resolved into invented teams. */
export function pendingParticipant(locale:InterfaceLocale,value:string|null){
  const unknown=locale==='br'?'A definir':locale==='mx'?'Por definir':'To be confirmed';
  if(!value||value==='TBC')return unknown;
  if(locale==='en')return value;
  const match=/^(Winner|Loser) (Match|Quarter-final|Semi-final) (\d+)$/i.exec(value);
  if(!match)return /^(Winner|Loser)\b/i.test(value)?unknown:value;
  const br=locale==='br',outcome=match[1].toLowerCase()==='winner'?(br?'Vencedor':'Ganador'):(br?'Perdedor':'Perdedor');
  const stage=match[2].toLowerCase()==='match'?(br?'jogo':'partido'):match[2].toLowerCase()==='quarter-final'?(br?'quartas de final':'cuartos de final'):(br?'semifinal':'semifinal');
  return `${outcome} · ${stage} ${match[3]}`;
}
