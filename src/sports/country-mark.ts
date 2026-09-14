import {targetBySlug,type FootballCompetitionTarget} from '@/config/footballCompetitions';

const ENGLAND_FLAG='\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';

export interface CountryMark {
  kind:'country'|'international';
  emoji:string;
  label:string;
}

function regionalFlag(code:string):string {
  return [...code.toUpperCase()].map(letter=>String.fromCodePoint(127397+letter.charCodeAt(0))).join('');
}

export function competitionCountryMark(target:Pick<FootballCompetitionTarget,'countryCode'|'countryNames'>|null|undefined):CountryMark {
  if(!target?.countryCode)return {kind:'international',emoji:'🌐',label:target?.countryNames[0]??'International'};
  if(target.countryCode==='GB'&&target.countryNames.includes('England'))return {kind:'country',emoji:ENGLAND_FLAG,label:'England'};
  return {kind:'country',emoji:regionalFlag(target.countryCode),label:target.countryNames[0]??target.countryCode};
}

export function countryMarkForSlug(slug:string):CountryMark {
  return competitionCountryMark(targetBySlug(slug));
}

export function countryMarkFromIso(iso2:string|null|undefined,label?:string|null):CountryMark {
  if(!iso2)return {kind:'international',emoji:'🌐',label:label??'International'};
  if(iso2.toUpperCase()==='GB'&&label==='England')return {kind:'country',emoji:ENGLAND_FLAG,label:'England'};
  return {kind:'country',emoji:regionalFlag(iso2),label:label??iso2};
}
