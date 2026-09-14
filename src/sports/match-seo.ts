import type {MatchHeaderView} from '@/match-center/types';
import {competitionName,competitionPath} from './policy';
import {interfaceDictionary,interfaceRoutes,matchPath,teamPath,type InterfaceLocale} from '@/localization/interface';
const absolute=(path:string)=>`https://livasports.com${path}`;
export function matchDateDescription(locale:InterfaceLocale,header:MatchHeaderView){
  const d=interfaceDictionary(locale),date=new Date(header.kickoff);
  if(!Number.isFinite(date.getTime()))return '';
  // Index metadata has a stable locale default; user preferences change the visible calendar only.
  return `${new Intl.DateTimeFormat(d.locale,{dateStyle:'medium',timeStyle:'short',timeZone:d.timeZone}).format(date)} (${d.timeZone.replaceAll('_',' ')})`;
}
export function sportsMatchSchema(locale:InterfaceLocale,h:MatchHeaderView){
  const canonical=absolute(matchPath(locale,h.publicId,h.home.name,h.away.name));
  const competition=competitionName(locale,h.competitionSlug)??h.competition;
  const status=h.status==='CANCELLED'?'https://schema.org/EventCancelled':h.status==='POSTPONED'?'https://schema.org/EventPostponed':h.status==='SCHEDULED'?'https://schema.org/EventScheduled':undefined;
  return [{
    '@context':'https://schema.org','@type':'SportsEvent',name:`${h.home.name} x ${h.away.name}`,
    startDate:h.kickoff,eventStatus:status,url:canonical,sport:'Football',
    homeTeam:{'@type':'SportsTeam',name:h.home.name,url:absolute(teamPath(locale,h.home.publicId,h.home.name))},
    awayTeam:{'@type':'SportsTeam',name:h.away.name,url:absolute(teamPath(locale,h.away.publicId,h.away.name))},
    location:h.venue?{'@type':'Place',name:h.venue,address:h.venueCity?{'@type':'PostalAddress',addressLocality:h.venueCity}:undefined}:undefined,
  },{
    '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'LivaSports',item:absolute(interfaceRoutes[locale].home)},
      {'@type':'ListItem',position:2,name:competition,item:absolute(competitionPath(locale,h.competitionSlug,{season:h.seasonId??undefined}))},
      {'@type':'ListItem',position:3,name:`${h.home.name} x ${h.away.name}`,item:canonical},
    ],
  }];
}
