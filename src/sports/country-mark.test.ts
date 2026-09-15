import {describe,expect,it} from 'vitest';
import {competitionCountryMark,countryMarkForSlug,countryMarkFromIso,sportsSearchMark} from './country-mark';
import {targetBySlug} from '@/config/footballCompetitions';
import {countryCodeFromName} from '@/profiles/localization';

describe('competition country marks',()=>{
  it('uses stored country codes rather than guessed geography',()=>{
    expect(countryMarkForSlug('brasileirao-serie-a')).toMatchObject({kind:'country',emoji:'🇧🇷',label:'Brazil',assetCode:'br'});
    expect(countryMarkForSlug('liga-mx')).toMatchObject({kind:'country',emoji:'🇲🇽',label:'Mexico'});
    expect(countryMarkForSlug('mls')).toMatchObject({kind:'country',emoji:'🇺🇸',label:'USA'});
    expect(countryMarkForSlug('la-liga')).toMatchObject({kind:'country',emoji:'🇪🇸',label:'Spain'});
    expect(countryMarkForSlug('serie-a-italy')).toMatchObject({kind:'country',emoji:'🇮🇹',label:'Italy'});
    expect(countryMarkForSlug('bundesliga')).toMatchObject({kind:'country',emoji:'🇩🇪',label:'Germany'});
  });
  it('uses the England flag from countryNames, not a guessed UK mark for other GB rows',()=>{
    const premier=targetBySlug('premier-league')!;
    expect(premier.countryCode).toBe('GB');
    expect(premier.countryNames).toContain('England');
    expect(competitionCountryMark(premier)).toMatchObject({emoji:'\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',assetCode:'gb-eng'});
    expect(countryMarkFromIso('GB','United Kingdom').emoji).toBe('🇬🇧');
  });
  it('uses an international mark when the model has no country code',()=>{
    expect(countryMarkForSlug('champions-league')).toMatchObject({kind:'international',emoji:'🌍',label:'UEFA / Europe',assetCode:null});
    expect(countryMarkForSlug('copa-libertadores')).toMatchObject({kind:'international',emoji:'🌎',label:'CONMEBOL / South America'});
    expect(competitionCountryMark(null).kind).toBe('international');
  });
  it('resolves player nationality from player metadata, including England',()=>{
    expect(countryMarkFromIso(countryCodeFromName('Brazil'),'Brazil').emoji).toBe('🇧🇷');
    expect(countryMarkFromIso(countryCodeFromName('England'),'England').emoji).toBe('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}');
    expect(countryCodeFromName(null)).toBeNull();
  });
  it('labels player search flags from nationality metadata, never the playing position',()=>{
    expect(sportsSearchMark({kind:'player',slug:null,countryCode:'SE',countryName:'Sweden',region:null})).toMatchObject({assetCode:'se',label:'Sweden'});
    expect(sportsSearchMark({kind:'player',slug:null,countryCode:null,countryName:null,region:null})).toMatchObject({kind:'international',assetCode:null});
  });
});
