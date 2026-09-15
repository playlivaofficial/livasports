import {targetBySlug,type FootballCompetitionTarget} from '@/config/footballCompetitions';
import type {SportsSearchResult} from './types';

const ENGLAND_FLAG='\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';

export interface CountryMark {
  kind:'country'|'international';
  emoji:string;
  label:string;
  assetCode:string|null;
}

function regionalFlag(code:string):string {
  return [...code.toUpperCase()].map(letter=>String.fromCodePoint(127397+letter.charCodeAt(0))).join('');
}

export function competitionCountryMark(target:Pick<FootballCompetitionTarget,'countryCode'|'countryNames'>|null|undefined):CountryMark {
  if(!target?.countryCode)return {kind:'international',emoji:'🌐',label:target?.countryNames[0]??'International',assetCode:null};
  if(target.countryCode==='GB'&&target.countryNames.includes('England'))return {kind:'country',emoji:ENGLAND_FLAG,label:'England',assetCode:'gb-eng'};
  return {kind:'country',emoji:regionalFlag(target.countryCode),label:target.countryNames[0]??target.countryCode,assetCode:target.countryCode.toLowerCase()};
}

export function countryMarkForSlug(slug:string):CountryMark {
  return competitionMark({slug});
}

export function countryMarkFromIso(iso2:string|null|undefined,label?:string|null):CountryMark {
  if(!iso2)return {kind:'international',emoji:'🌐',label:label??'International',assetCode:null};
  if((iso2.toUpperCase()==='GB'&&label==='England')||iso2.toUpperCase()==='EN')return {kind:'country',emoji:ENGLAND_FLAG,label:'England',assetCode:'gb-eng'};
  return {kind:'country',emoji:regionalFlag(iso2),label:label??iso2,assetCode:iso2.toLowerCase()};
}

export function competitionMark(value:{slug:string;countryCode?:string|null;countryName?:string|null;region?:string|null}):CountryMark {
  const target=targetBySlug(value.slug),region=value.region??target?.region;
  // Canonical competition metadata wins over provider pseudo-countries such as EU.
  if(target&&!target.countryCode){
    if(region==='EUROPE')return {kind:'international',emoji:'🌍',label:'UEFA / Europe',assetCode:null};
    if(region==='SOUTH_AMERICA')return {kind:'international',emoji:'🌎',label:'CONMEBOL / South America',assetCode:null};
    if(region==='NORTH_AMERICA')return {kind:'international',emoji:'🌎',label:'CONCACAF / North America',assetCode:null};
    return {kind:'international',emoji:'🏆',label:'International competition',assetCode:null};
  }
  if(value.countryCode)return countryMarkFromIso(value.countryCode,value.countryName);
  if(target?.countryCode)return competitionCountryMark(target);
  if(region==='EUROPE')return {kind:'international',emoji:'🌍',label:'UEFA / Europe',assetCode:null};
  if(region==='SOUTH_AMERICA')return {kind:'international',emoji:'🌎',label:'CONMEBOL / South America',assetCode:null};
  if(region==='NORTH_AMERICA')return {kind:'international',emoji:'🌎',label:'CONCACAF / North America',assetCode:null};
  return {kind:'international',emoji:'🏆',label:target?.countryNames[0]??'International competition',assetCode:null};
}

export function sportsSearchMark(row:Pick<SportsSearchResult,'kind'|'slug'|'countryCode'|'countryName'|'region'>):CountryMark {
  if(row.kind==='competition'&&row.slug)return competitionMark({slug:row.slug,countryCode:row.countryCode,countryName:row.countryName,region:row.region});
  return countryMarkFromIso(row.countryCode,row.countryName);
}
