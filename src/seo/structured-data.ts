import {interfaceDictionary,interfaceRoutes,languageTags,type InterfaceLocale} from '@/localization/interface';
import {competitionPath,type CompetitionTab} from '@/sports/policy';
import {sportsCopy} from '@/sports/copy';
import type {CompetitionHub} from '@/sports/types';
import {absoluteUrl,siteOrigin} from './policy';

/**
 * P2 structured data. Only visible, source-backed facts. No organizer, address,
 * ratings, ticket offers, founding dates or broadcast claims are invented here.
 */
export const organizationId=`${siteOrigin}/#organization`;
export function siteSchema(locale:InterfaceLocale){
  const home=absoluteUrl(interfaceRoutes[locale].home),d=interfaceDictionary(locale);
  return [
    {'@context':'https://schema.org','@type':'Organization','@id':organizationId,name:'LivaSports',url:`${siteOrigin}/`,logo:`${siteOrigin}/icon.svg`},
    {'@context':'https://schema.org','@type':'WebSite','@id':`${home}#website`,name:'LivaSports',url:home,inLanguage:languageTags[locale],description:d.pages.home.description,publisher:{'@id':organizationId}},
  ];
}
export function competitionHubSchema(locale:InterfaceLocale,hub:CompetitionHub,tab:CompetitionTab){
  const d=interfaceDictionary(locale),t=sportsCopy[locale];
  const hubUrl=absoluteUrl(competitionPath(locale,hub.slug));
  const items=[
    {'@type':'ListItem',position:1,name:'LivaSports',item:absoluteUrl(interfaceRoutes[locale].home)},
    {'@type':'ListItem',position:2,name:d.navigation.football,item:absoluteUrl(interfaceRoutes[locale].football)},
    {'@type':'ListItem',position:3,name:hub.name,item:hubUrl},
  ];
  // Mirror the visible hierarchy: a non-default season is its own level; a non-fixtures tab is the leaf.
  const season=hub.season&&hub.season.id!==hub.defaultSeasonId?hub.season:null;
  if(season)items.push({'@type':'ListItem',position:items.length+1,name:`${t.season} ${season.name}`,item:absoluteUrl(competitionPath(locale,hub.slug,{season:season.id}))});
  if(tab!=='fixtures')items.push({'@type':'ListItem',position:items.length+1,name:t[tab],item:absoluteUrl(competitionPath(locale,hub.slug,{tab,season:season?.id}))});
  return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items};
}
