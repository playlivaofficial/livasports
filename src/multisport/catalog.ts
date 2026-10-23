import coverage from './catalog-data.json';
import type {InterfaceLocale} from '@/localization/interface';
import {tr,translated} from './translation';

export const sportIds=['football','basketball','baseball','american-football','ice-hockey','mma','tennis'] as const;
export type CatalogSport=typeof sportIds[number];
export const sportNames={football:tr('Football','Fútbol','Futebol'),basketball:tr('Basketball','Baloncesto','Basquete'),baseball:tr('Baseball','Béisbol','Beisebol'),'american-football':tr('American football','Fútbol americano','Futebol americano'),'ice-hockey':tr('Ice hockey','Hockey sobre hielo','Hóquei no gelo'),mma:tr('MMA','MMA','MMA'),tennis:tr('Tennis','Tenis','Tênis')};
export const sportName=(id:CatalogSport,locale:InterfaceLocale)=>translated(sportNames[id],locale);
export const sportsNamespace=(locale:InterfaceLocale)=>locale==='en'?'sports':locale==='br'?'esportes':'deportes';
export function sportsPath(locale:InterfaceLocale,sport?:string,competition?:string,entity?:string){return `/${locale}/${sportsNamespace(locale)}${sport?'/'+sport:''}${competition?'/'+competition:''}${entity?'/entities/'+entity:''}`;}
export const competitions=coverage;
export type Competition=typeof competitions[number];
export const competitionById=(id:string)=>competitions.find(item=>item.id===id);
export const sportCompetitions=(sport:string)=>competitions.filter(item=>item.sport===sport);
export const snapshotSeasonToken=(season:string)=>season.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const snapshotEntityPath=(locale:InterfaceLocale,snapshot:{sport:string;competitionId:string;season:string},entityId:string)=>`${sportsPath(locale,snapshot.sport,snapshot.competitionId)}/season/${snapshotSeasonToken(snapshot.season)}/entities/${encodeURIComponent(entityId)}`;
export const competitionPath=(locale:InterfaceLocale,id:string)=>{const competition=competitionById(id);return competition?sportsPath(locale,competition.sport,id):sportsPath(locale);};
export const isCatalogSport=(value:string):value is CatalogSport=>(sportIds as readonly string[]).includes(value);
export function translateSportsPath(path:string,target:InterfaceLocale):string|null{
 const parts=path.split('/').filter(Boolean),source=parts[0] as InterfaceLocale;
 if(!['en','br','mx','co','pe'].includes(source)||parts[1]!==sportsNamespace(source))return null;
 if(parts.length===2)return sportsPath(target);
 if(!isCatalogSport(parts[2]))return null;
 if(parts.length===3)return sportsPath(target,parts[2]);
 const comp=competitionById(parts[3]);if(!comp||comp.sport!==parts[2])return null;
 if(parts.length===4)return sportsPath(target,parts[2],parts[3]);
 if(parts.length===8&&parts[4]==='season'&&/^[a-z0-9-]{1,64}$/.test(parts[5])&&parts[6]==='entities'){
  try{const id=decodeURIComponent(parts[7]);return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id)?`${sportsPath(target,parts[2],parts[3])}/season/${parts[5]}/entities/${encodeURIComponent(id)}`:null;}catch{return null;}
 }
 if(parts.length===6&&parts[4]==='entities'){
  try{const id=decodeURIComponent(parts[5]);return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id)?sportsPath(target,parts[2],parts[3],encodeURIComponent(id)):null;}catch{return null;}
 }
 return parts.length===6&&parts[4]==='season'&&/^[A-Za-z0-9-]{1,32}$/.test(parts[5])?`${sportsPath(target,parts[2],parts[3])}/season/${parts[5]}`:null;
}
export const sportIntroductions={
 football:tr('The game, from local rivalries to the world stage. Explore leagues, tournament stages and source-attributed records.','El juego, de las rivalidades locales al escenario mundial. Explora ligas, fases y registros con sus fuentes.','O jogo, das rivalidades locais ao cenário mundial. Explore ligas, fases e registros com suas fontes.'),
 basketball:tr('NBA and EuroLeague: two competitions, distinct calendars and playoff paths.','NBA y EuroLeague: dos competiciones, calendarios y caminos a los playoffs distintos.','NBA e EuroLeague: duas competições, calendários e caminhos aos playoffs diferentes.'),
 baseball:tr('Follow Major League Baseball, its two leagues, divisions and postseason.','Sigue la Major League Baseball, sus dos ligas, divisiones y postemporada.','Acompanhe a Major League Baseball, suas duas ligas, divisões e pós-temporada.'),
 'american-football':tr('NFL coverage across the AFC and NFC, from the regular season to the Super Bowl.','La NFL, sus conferencias AFC y NFC, desde la temporada regular hasta el Super Bowl.','A NFL, suas conferências AFC e NFC, da temporada regular ao Super Bowl.'),
 'ice-hockey':tr('NHL stories and competition context, from the regular season to the Stanley Cup.','Historias y contexto de la NHL, de la temporada regular a la Stanley Cup.','Histórias e contexto da NHL, da temporada regular à Stanley Cup.'),
 mma:tr('UFC events, fighters and divisions. Rankings and confirmed fight cards are separate records.','Eventos, peleadores y divisiones de UFC. Las clasificaciones y las carteleras confirmadas son registros distintos.','Eventos, lutadores e divisões do UFC. Rankings e cards confirmados são registros diferentes.'),
 tennis:tr('ATP, WTA, Grand Slams and team events. World rankings are not tournament seedings.','ATP, WTA, Grand Slams y torneos por equipos. El ranking mundial no es la lista de cabezas de serie de un torneo.','ATP, WTA, Grand Slams e torneios por equipes. O ranking mundial não é a lista de cabeças de chave de um torneio.'),
};
