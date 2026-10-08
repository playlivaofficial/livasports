import {getDictionary,localeRoutes,type PageKey,type SiteLocale} from '@/config/i18n';
import {matchPath as legacyMatchPath,slugifyMatch} from '@/match-center/routes';
import {teamPath as legacyTeamPath,playerPath as legacyPlayerPath,slugifyProfileName} from '@/profiles/routes';
import {authRoutes,type AuthRouteKey} from './auth-copy';
import {favoritesRoutes,type FavoritesRouteKey} from './favorites-copy';
import {legalKind,legalPath} from './legal-routes';
import {helpKind,helpPath} from './help-routes';

// Presentation preferences never replace the existing commercial jurisdiction.
export type InterfaceLocale=SiteLocale|'en';
export type PublicLanguage='es'|'pt'|'en';
export const publicLanguages=['es','pt','en'] as const;
export const publicLanguageNames={es:'Español',pt:'Português',en:'English'} as const;
export function publicLanguage(locale:InterfaceLocale):PublicLanguage{return locale==='br'?'pt':locale==='en'?'en':'es';}
/** Migrate legacy language cookies without treating their country as a GEO choice. */
export function languagePreference(value:unknown):PublicLanguage|null{
  return publicLanguages.includes(value as PublicLanguage)?value as PublicLanguage:isInterfaceLocale(value)?publicLanguage(value):null;
}
export const languageCookie='livasports_language';
export const interfaceLocales=['br','mx','co','pe','en'] as const;
export const languageNames={br:'Português',mx:'Español',co:'Español',pe:'Español',en:'English'} as const;
export const languageTags={br:'pt-BR',mx:'es-MX',co:'es-CO',pe:'es-PE',en:'en'} as const;
export const interfaceRoutes={...localeRoutes,en:{home:'/en',football:'/en/football',live:'/en/live',today:'/en/matches/today'}} as const;
export function isInterfaceLocale(value:unknown):value is InterfaceLocale{return interfaceLocales.includes(value as InterfaceLocale);}
export function pathLocale(path:string):InterfaceLocale|null{const value=path.split('/')[1];return isInterfaceLocale(value)?value:null;}
export function defaultLanguage(preference:unknown,country:unknown):InterfaceLocale{
  const language=languagePreference(preference);
  if(language==='pt')return 'br';
  if(language==='en')return 'en';
  if(language==='es')return country==='CO'?'co':country==='PE'?'pe':'mx';
  return country==='MX'?'mx':country==='CO'?'co':country==='PE'?'pe':country==='BR'?'br':'en';
}
export function matchPath(locale:InterfaceLocale,id:string,home:string,away:string){
  return locale==='en'?`/en/match/${slugifyMatch(home,away)}-${id}`:legacyMatchPath(locale,id,home,away);
}
export function teamPath(locale:InterfaceLocale,id:string,name:string){return locale==='en'?`/en/team/${slugifyProfileName(name)}-${id}`:legacyTeamPath(locale,id,name);}
export function playerPath(locale:InterfaceLocale,id:string,name:string){return locale==='en'?`/en/player/${slugifyProfileName(name)}-${id}`:legacyPlayerPath(locale,id,name);}
export function languageAlternates(br:string,mx:string,en:string,co=mx.replace(/\/mx(?=\/|\?|$)/,'/co'),pe=mx.replace(/\/mx(?=\/|\?|$)/,'/pe')){
  return {'pt-BR':br,'es-MX':mx,'es-CO':co,'es-PE':pe,en,'x-default':en};
}
export function translatedPath(input:string,target:InterfaceLocale):string{
  if(!input.startsWith('/')||input.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(input))return interfaceRoutes[target].home;
  const url=new URL(input,'https://livasports.com');
  const source=pathLocale(url.pathname);if(!source)return interfaceRoutes[target].home;
  const page=(Object.keys(interfaceRoutes[source]) as PageKey[]).find(key=>interfaceRoutes[source][key]===url.pathname);
  const auth=(Object.keys(authRoutes[source]) as AuthRouteKey[]).find(key=>authRoutes[source][key]===url.pathname);
  const favorites=(Object.keys(favoritesRoutes[source]) as FavoritesRouteKey[]).find(key=>favoritesRoutes[source][key]===url.pathname);
  const legal=legalKind(source,url.pathname.split('/')[2]);
  const help=helpKind(source,url.pathname.split('/')[2]);
  const entity=/^\/(?:br\/(jogo|time|jogador)|(?:mx|co|pe)\/(partido|equipo|jugador)|en\/(match|team|player))\/([a-z0-9-]+-[a-f0-9]{16})$/i.exec(url.pathname);
  let path:string=interfaceRoutes[target].home;
  if(legal&&url.pathname===legalPath(source,legal))path=legalPath(target,legal);
  else if(help&&url.pathname===helpPath(source,help))path=helpPath(target,help);
  else if(auth)path=authRoutes[target][auth];
  else if(favorites)path=favoritesRoutes[target][favorites];
  else if(page)path=interfaceRoutes[target][page];
  else if(entity){
    const segment=entity[1]??entity[2]??entity[3];
    const kind=['jogo','partido','match'].includes(segment)?'match':['time','equipo','team'].includes(segment)?'team':'player';
    const spanish={match:'partido',team:'equipo',player:'jugador'};
    const segments={br:{match:'jogo',team:'time',player:'jogador'},mx:spanish,co:spanish,pe:spanish,en:{match:'match',team:'team',player:'player'}};
    path=`/${target}/${segments[target][kind]}/${entity[4]}`;
  }else return path;
  return path+url.search+url.hash;
}

export const englishDictionary={
  locale:'en',countryName:'Football',timeZone:'UTC',
  navigation:{home:'Home',football:'Football',live:'Live',today:'Today’s matches'},
  pages:{home:{title:'Football: next 7 days',description:'Fixtures for the next 7 days, scores, odds and match context from the competitions we cover.'},
    football:{title:'Football fixtures',description:'Explore fixtures and results, organised by competition.'},
    live:{title:'Live football',description:'Matches in progress and the latest available scores.'},
    today:{title:'Today’s matches',description:'Today’s football schedule in your selected time zone.'}},
  labels:{skipToContent:'Skip to sports content',primaryNavigation:'Main navigation',teams:'Teams'},
  statuses:{SCHEDULED:'Scheduled',LIVE:'Live',HALFTIME:'Half-time',FINISHED:'Finished',POSTPONED:'Postponed',CANCELLED:'Cancelled',ABANDONED:'Abandoned'},
} as const;
export function interfaceDictionary(locale:InterfaceLocale){return locale==='en'?englishDictionary:getDictionary(locale);}
