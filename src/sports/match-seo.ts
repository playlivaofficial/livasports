import type {MatchHeaderView} from '@/match-center/types';
import {competitionName,competitionPath} from './policy';
import {interfaceDictionary,interfaceRoutes,matchPath,teamPath,type InterfaceLocale} from '@/localization/interface';
import {brandOpenGraphImage} from '@/seo/open-graph';
import {englishCompetition} from '@/localization/sports-copy';
const absolute=(path:string)=>`https://livasports.com${path}`;
export function matchDateDescription(locale:InterfaceLocale,header:MatchHeaderView){
  const d=interfaceDictionary(locale),date=new Date(header.kickoff);
  if(!Number.isFinite(date.getTime()))return '';
  // Index metadata has a stable locale default; user preferences change the visible calendar only.
  return `${new Intl.DateTimeFormat(d.locale,{dateStyle:'medium',timeStyle:'short',timeZone:d.timeZone}).format(date)} (${d.timeZone.replaceAll('_',' ')})`;
}

// ---------------------------------------------------------------------------
// M1 — match metadata that targets real match search intent
// ---------------------------------------------------------------------------
/**
 * Titles were just "Home x Away", which reads the same as every other listing of the fixture and
 * states no intent. They now carry the competition, its season and the localized commercial word the
 * product already uses elsewhere ("odds" in pt-BR/en, "cuotas" in es-MX). A played match switches to
 * result intent because that is what people search for afterwards. Every part comes from stored
 * fixture facts: no broadcast, prediction or per-match bookmaker claim is made.
 */
const matchIntent={
  br:{upcoming:'Odds e estatísticas',finished:'Resultado e estatísticas'},
  mx:{upcoming:'Cuotas y estadísticas',finished:'Resultado y estadísticas'},
  en:{upcoming:'Odds and stats',finished:'Result and stats'},
} as const;
const matchSummary={
  br:{upcoming:'Escalações, estatísticas e comparação de odds.',finished:'Resultado, escalações, estatísticas e lances da partida.'},
  mx:{upcoming:'Alineaciones, estadísticas y comparación de cuotas.',finished:'Marcador, alineaciones, estadísticas y eventos del partido.'},
  en:{upcoming:'Lineups, statistics and odds comparison.',finished:'Result, lineups, statistics and match events.'},
} as const;
const matchPhase=(header:MatchHeaderView)=>header.status==='FINISHED'?'finished':'upcoming';
/**
 * The competition as a reader searches for it: localized name plus the season when the fixture has one.
 * A fixture outside the slug registry still reaches the English reader translated, because the stored
 * name is pt-BR ("Copa do Brasil") and the en routes must never show it untranslated.
 */
export function localizedCompetitionName(locale:InterfaceLocale,header:MatchHeaderView){
  return competitionName(locale,header.competitionSlug)??(locale==='en'?englishCompetition(header.competition):header.competition);
}
export function matchCompetitionLabel(locale:InterfaceLocale,header:MatchHeaderView){
  const name=localizedCompetitionName(locale,header);
  return header.season?`${name} ${header.season}`:name;
}
export function matchSeoTitle(locale:InterfaceLocale,header:MatchHeaderView){
  return `${header.home.name} x ${header.away.name} — ${matchIntent[locale][matchPhase(header)]} | ${matchCompetitionLabel(locale,header)}`;
}
export function matchSeoDescription(locale:InterfaceLocale,header:MatchHeaderView){
  const when=matchDateDescription(locale,header);
  return `${header.home.name} x ${header.away.name} — ${matchCompetitionLabel(locale,header)}. ${when?`${when}. `:''}${matchSummary[locale][matchPhase(header)]}`.replace(/\s+/g,' ').trim();
}

/**
 * schema.org EventStatusType has exactly five members and no "completed" state, so a match that was
 * played keeps EventScheduled — it means "proceeded as scheduled", which is true of a finished match.
 * ABANDONED has no truthful mapping, so it emits no status rather than an invented one. `endDate` is
 * deliberately absent: the real final whistle is not stored, and estimating it would be fabrication.
 */
function eventStatus(status:MatchHeaderView['status']){
  switch(status){
    case 'CANCELLED':return 'https://schema.org/EventCancelled';
    case 'POSTPONED':return 'https://schema.org/EventPostponed';
    case 'SCHEDULED':case 'LIVE':case 'HALFTIME':case 'FINISHED':return 'https://schema.org/EventScheduled';
    default:return undefined;
  }
}
/**
 * Google requires a location on every SportsEvent, and the previous `h.venue?{…}:undefined` shipped
 * items with the key missing whenever a fixture had no stored venue — the invalid-Event error in
 * Search Console. The stored venue and city are the only truthful sources and are used in that order.
 */
function eventLocation(header:MatchHeaderView){
  const name=header.venue??header.venueCity;
  if(!name)return null;
  return {'@type':'Place',name,...(header.venueCity?{address:{'@type':'PostalAddress',addressLocality:header.venueCity}}:{})};
}

/** Split so callers and tests can inspect the event and the breadcrumb independently; `event` is null when no truthful location exists. */
export function matchSchemaParts(locale:InterfaceLocale,h:MatchHeaderView){
  const canonical=absolute(matchPath(locale,h.publicId,h.home.name,h.away.name));
  const competition=localizedCompetitionName(locale,h);
  const homeTeam={'@type':'SportsTeam',name:h.home.name,url:absolute(teamPath(locale,h.home.publicId,h.home.name))};
  const awayTeam={'@type':'SportsTeam',name:h.away.name,url:absolute(teamPath(locale,h.away.publicId,h.away.name))};
  const breadcrumb={
    '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'LivaSports',item:absolute(interfaceRoutes[locale].home)},
      // M1: the canonical competition URL. competitionCanonical() drops a ?season= that equals the hub's
      // default season, so emitting the season here pointed the breadcrumb at a non-canonical twin.
      {'@type':'ListItem',position:2,name:competition,item:absolute(competitionPath(locale,h.competitionSlug))},
      {'@type':'ListItem',position:3,name:`${h.home.name} x ${h.away.name}`,item:canonical},
    ],
  };
  const location=eventLocation(h);
  // No truthful location means no valid SportsEvent at all; the healthy BreadcrumbList still ships.
  const event=location?{
    '@context':'https://schema.org','@type':'SportsEvent',name:`${h.home.name} x ${h.away.name}`,
    startDate:h.kickoff,eventStatus:eventStatus(h.status),url:canonical,sport:'Football',
    description:matchSeoDescription(locale,h),image:absolute(brandOpenGraphImage.url),
    homeTeam,awayTeam,performer:[homeTeam,awayTeam],location,
  }:null;
  return {event,breadcrumb};
}
export function sportsMatchSchema(locale:InterfaceLocale,h:MatchHeaderView){
  const {event,breadcrumb}=matchSchemaParts(locale,h);
  return event?[event,breadcrumb]:[breadcrumb];
}
