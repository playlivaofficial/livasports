import type {Metadata} from 'next';
import {interfaceRoutes,languageAlternates,languageTags,type InterfaceLocale} from '@/localization/interface';
import {authRoutes} from '@/localization/auth-copy';
import {favoritesRoutes} from '@/localization/favorites-copy';
import {legalKinds,legalPath} from '@/localization/legal-routes';
import {helpKinds,helpPath} from '@/localization/help-routes';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {competitionPath,competitionTabs,sportsPage,sportsSeason,type CompetitionTab} from '@/sports/policy';

/**
 * P2 — single URL/indexability policy shared by metadata, canonicals, hreflang,
 * sitemaps, robots, internal links and the SEO tests. Every rule that decides
 * whether a URL is a distinct indexable identity lives here; route modules only
 * resolve data and ask this module for the answer.
 */
export const siteOrigin='https://livasports.com';
export const locales=['br','mx','en'] as const;
export const absoluteUrl=(path:string)=>`${siteOrigin}${path}`;

export type RouteFamily='home'|'football'|'live'|'today'|'competition'|'match'|'team'|'player'|'legal'|'help'
  |'pending'|'search'|'signin'|'account'|'myMatches'|'owner'|'qa'|'api'|'go'|'language'|'timeZone';

export interface RouteFamilyPolicy {
  /** What a URL of this family identifies. */
  identity:string;
  /** Query parameters that change the canonical identity (deterministic order). */
  semanticParams:readonly string[];
  /** Indexable when the entity exists and the minimum-content rule below holds. */
  indexable:boolean;
  /** Emitted by the sitemap engine when indexable. */
  sitemap:boolean;
  /** pt-BR / es-MX / en equivalents exist and are emitted as reciprocal hreflang. */
  alternates:boolean;
  /** robots.txt crawl control (independent from index control). */
  crawl:'allow'|'disallow';
  /** Minimum meaningful content for an indexable response. */
  minimumContent:string;
}

export const routePolicies:Record<RouteFamily,RouteFamilyPolicy>={
  home:{identity:'Locale home: upcoming football board',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Board heading, competition navigation and fixture rows or a truthful empty state'},
  football:{identity:'Football hub across enabled competitions',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Board heading, competition navigation and fixture rows'},
  live:{identity:'Live football board',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Heading and live rows or a truthful empty state'},
  today:{identity:'Today\'s schedule board',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Heading and today\'s fixture rows or a truthful empty state'},
  competition:{identity:'Competition hub identified by ?competition=<registry slug>; tab, non-default season and page>1 are distinct content',semanticParams:['competition','tab','season','p'],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Competition name, resolved season and at least one row for the active tab'},
  match:{identity:'Fixture identified by its 16-hex public id (slug is cosmetic and 308-corrected)',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Both team names, competition and kickoff/result state'},
  team:{identity:'Team profile identified by public id',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Team name plus persisted matches, squad or statistics (profile.indexable)'},
  player:{identity:'Player profile identified by public id',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Player name plus season statistics or a linked match log (profile.indexable)'},
  legal:{identity:'Legal/safety document',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Reviewed document text'},
  help:{identity:'Evergreen product help topic',semanticParams:[],indexable:true,sitemap:true,alternates:true,crawl:'allow',minimumContent:'Reviewed help text describing implemented behaviour'},
  pending:{identity:'Fixture whose participants are not yet drawn',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'allow',minimumContent:'—'},
  search:{identity:'Internal search results (?q=)',semanticParams:['q'],indexable:false,sitemap:false,alternates:false,crawl:'allow',minimumContent:'—'},
  signin:{identity:'Authentication utility',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'allow',minimumContent:'—'},
  account:{identity:'Authenticated account page',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'allow',minimumContent:'—'},
  myMatches:{identity:'Personalised favorites feed',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'allow',minimumContent:'—'},
  owner:{identity:'Owner preview tooling (separately authenticated)',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'disallow',minimumContent:'—'},
  qa:{identity:'Development-only QA replay (404 in production)',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'disallow',minimumContent:'—'},
  api:{identity:'JSON/API endpoints',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'disallow',minimumContent:'—'},
  go:{identity:'Affiliate/tracking redirects',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'disallow',minimumContent:'—'},
  language:{identity:'POST-only language preference endpoint',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'disallow',minimumContent:'—'},
  timeZone:{identity:'POST-only time-zone preference endpoint',semanticParams:[],indexable:false,sitemap:false,alternates:false,crawl:'disallow',minimumContent:'—'},
};

/** Parameters that never create a new identity: tracking, cosmetic UI, board filters and profile panel state. */
export const nonSemanticParams=['date','view','q','matches','squadSeason','theme','ref','fbclid','gclid','msclkid','ttclid','igshid','mc_cid','mc_eid'] as const;
export function isNonSemanticParam(name:string){return nonSemanticParams.includes(name as typeof nonSemanticParams[number])||/^utm_/i.test(name);}

/** Crawl-only rules for robots.txt. Indexing is controlled per page with robots metadata. */
export const robotsDisallow=['/api/','/go/','/owner/','/qa/','/language','/time-zone'] as const;

export const noindexRobots={index:false,follow:true} as const;
export const noindexNofollowRobots={index:false,follow:false} as const;

export function alternateCluster(paths:Record<InterfaceLocale,string>){
  return languageAlternates(paths.br,paths.mx,paths.en);
}
/** Canonical + reciprocal hreflang for one entity across the three locales. */
export function localizedAlternates(locale:InterfaceLocale,paths:Record<InterfaceLocale,string>):NonNullable<Metadata['alternates']>{
  return {canonical:paths[locale],languages:alternateCluster(paths)};
}
export function openGraphLocale(locale:InterfaceLocale){return languageTags[locale].replace('-','_');}

// ---------------------------------------------------------------------------
// Competition hubs
// ---------------------------------------------------------------------------
export interface ResolvedCompetitionView {
  slug:string;
  tab:CompetitionTab;
  /** Season actually rendered (null when the source has no season). */
  seasonId:string|null;
  /** Season the hub resolves without a ?season parameter. */
  defaultSeasonId:string|null;
  page:number;
  /** Total pages for paginated tabs; 1 for standings/scorers/teams. */
  pages:number;
  /** Row count for the active tab. */
  rows:number;
}
export interface CompetitionCanonical {
  paths:Record<InterfaceLocale,string>;
  indexable:boolean;
  reason:'ok'|'no-season'|'empty-tab'|'page-out-of-range';
  season:string|undefined;
  page:number;
}
/** Deterministic canonical for a resolved competition view: competition, tab (not fixtures), season (only when not the default), p (only when >1 and in range). */
export function competitionCanonical(view:ResolvedCompetitionView):CompetitionCanonical{
  const season=view.seasonId&&view.seasonId!==view.defaultSeasonId?view.seasonId:undefined;
  const paginated=view.tab==='fixtures'||view.tab==='results';
  const outOfRange=paginated&&view.page>Math.max(1,view.pages);
  const page=paginated&&!outOfRange?view.page:1;
  const paths=Object.fromEntries(locales.map(locale=>[locale,competitionPath(locale,view.slug,{tab:view.tab,season,page})])) as Record<InterfaceLocale,string>;
  const reason=!view.seasonId?'no-season':outOfRange?'page-out-of-range':view.rows===0?'empty-tab':'ok';
  return {paths,indexable:reason==='ok',reason,season,page};
}
/** Parse the query the way the board does, so metadata and page agree before data is loaded. */
export function competitionRequest(query:Record<string,string|string[]|undefined>){
  const slug=typeof query.competition==='string'?query.competition:'';
  const known=FOOTBALL_COMPETITION_TARGETS.some(target=>target.slug===slug);
  return {slug,known,tab:competitionTabFromQuery(query.tab),season:sportsSeason(query.season),page:sportsPage(query.p),search:query.q!==undefined};
}
function competitionTabFromQuery(value:unknown):CompetitionTab{return competitionTabs.includes(value as CompetitionTab)?value as CompetitionTab:'fixtures';}

// ---------------------------------------------------------------------------
// Static clusters (sitemap + metadata read the same lists)
// ---------------------------------------------------------------------------
export type StaticPage='home'|'football'|'live'|'today';
export const staticPages:readonly StaticPage[]=['home','football','live','today'];
export function staticPaths(page:StaticPage):Record<InterfaceLocale,string>{return {br:interfaceRoutes.br[page],mx:interfaceRoutes.mx[page],en:interfaceRoutes.en[page]};}
export function legalPaths(kind:typeof legalKinds[number]):Record<InterfaceLocale,string>{return {br:legalPath('br',kind),mx:legalPath('mx',kind),en:legalPath('en',kind)};}
export function helpPaths(kind:typeof helpKinds[number]):Record<InterfaceLocale,string>{return {br:helpPath('br',kind),mx:helpPath('mx',kind),en:helpPath('en',kind)};}
export function competitionPaths(slug:string,options:{tab?:CompetitionTab;season?:string;page?:number}={}):Record<InterfaceLocale,string>{
  return {br:competitionPath('br',slug,options),mx:competitionPath('mx',slug,options),en:competitionPath('en',slug,options)};
}
export const enabledCompetitionSlugs=()=>FOOTBALL_COMPETITION_TARGETS.filter(target=>target.enabled).map(target=>target.slug);

/** Every path that must never enter a sitemap, for policy tests and sitemap validation. */
export function privatePathPrefixes(){
  return [
    ...locales.flatMap(locale=>[authRoutes[locale].signin,authRoutes[locale].account,favoritesRoutes[locale].myMatches]),
    '/owner','/qa','/api','/go','/language','/time-zone',
  ];
}
export function isPrivatePath(path:string){const pathname=path.split('?')[0];return privatePathPrefixes().some(prefix=>pathname===prefix||pathname.startsWith(prefix+'/'));}
