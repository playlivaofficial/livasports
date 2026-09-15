import {describe,it,expect} from 'vitest';
import {competitionPath,competitionTab,sportsPage,sportsSeason,sportsQuery,numericStatistic,sportStage,sportGroup,competitionName,pendingParticipant} from './policy';
import {localizedCountry} from '@/profiles/localization';
import {footballMetadata} from './metadata';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {translatedPath} from '@/localization/interface';
describe('sports navigation boundaries',()=>{
  it('localizes the oldest observed European knockout rounds',()=>{
    expect(sportStage('br','Round of 64')).toBe('32 avos de final');
    expect(sportStage('mx','Round of 64')).toBe('Treintaidosavos de final');
    expect(sportStage('br','Play-offs Round')).toBe('Eliminatórias');
    expect(sportStage('mx','Play-offs Round')).toBe('Eliminatorias');
  });
  it('localizes the official Mexican qualification phase in Portuguese and English',()=>{
    expect(sportStage('br','Apertura - Reclasificación')).toBe('Apertura · Repescagem');
    expect(sportStage('mx','Apertura - Reclasificación')).toBe('Apertura · Reclasificación');
    expect(sportStage('en','Apertura - Reclasificación')).toBe('Apertura - Qualification play-off');
  });
  it('localizes the two group phases and qualification in the oldest European seasons',()=>{
    for(const locale of ['br','mx'] as const){
      expect(sportStage(locale,'1st Group Stage')).toBe('1ª fase de grupos');
      expect(sportStage(locale,'2nd Group Stage')).toBe('2ª fase de grupos');
    }
    expect(sportStage('br','Qualifying')).toBe('Fase classificatória');
    expect(sportStage('mx','Qualifying')).toBe('Fase clasificatoria');
    expect(sportStage('en','1st Group Stage')).toBe('1st Group Stage');
  });
  it.each(['2nd Phase - Final','1st Phase - Semi-finals','2nd Phase - Semi-finals','1st Phase','2nd Phase','2nd Phase - Quarter-finals','Taça Guanabara','1st Phase - 8th Finals','Round of 32','1st Phase - Final','1st Phase - Quarter-finals','2nd Phase - 8th Finals'])('localizes the observed historical phase %s',stage=>{
    for(const locale of ['br','mx'] as const){expect(sportStage(locale,stage)).toBeTruthy();expect(sportStage(locale,stage)).not.toMatch(/Phase|Round of|Finals/);}
    expect(sportStage('en',stage)).toBe(stage);
  });
  it.each(['Conference League Play-offs - Final','Qualification Round 1','MLS Cup - Final','MLS Cup - Round 1 - Best of 3','Qualification Round 3','Quarterfinals','MLS Cup - Conference Finals','MLS Cup - Conference Semi-finals','MLS Cup - Play-In Round','Qualification Round 2','Conference League Play-offs - Semi-finals'])('localizes observed continental and MLS stage %s',stage=>{
    for(const locale of ['br','mx'] as const){expect(sportStage(locale,stage)).toBeTruthy();expect(sportStage(locale,stage)).not.toMatch(/Round|Play-offs|Finals|Best of|Quarterfinals/);}
    expect(sportStage('en',stage)).toBe(stage);
  });
  it('normalizes provider group prefixes and localizes named conferences',()=>{
    expect(sportGroup('br','Group A')).toBe('Grupo A');expect(sportGroup('mx','Group A')).toBe('Grupo A');expect(sportGroup('en','Group A')).toBe('Group A');
    expect(sportGroup('br','B')).toBe('Grupo B');expect(sportGroup('br','Eastern Conference')).toBe('Conferência Leste');expect(sportGroup('mx','Western Conference')).toBe('Conferencia Oeste');
    expect(sportGroup('en','Western Conference')).toBe('Western Conference');expect(sportGroup('br',null)).toBeNull();
  });
  it.each(['16th Finals','Championship - Final','Championship - Quarter-finals','Championship - Semi-finals','Finals','Knockout Round Play-offs','Paulista Série A1','Promotion Play-offs','Promotion Play-offs - Final','Promotion Play-offs - Finals','Promotion Play-offs - Qualifying Round','Promotion Play-offs - Semi-finals','Relegation Play-offs - Final','Relegation Round','Round 1','Round 2','Taça Rio - Final','Taça Rio - Semi-finals'])('localizes the observed historical stage %s',stage=>{
    for(const locale of ['br','mx'] as const){expect(sportStage(locale,stage)).toBeTruthy();expect(sportStage(locale,stage)).not.toMatch(/Round|Play-offs|Championship|Finals/);}
    expect(sportStage('en',stage)).toBe(stage);
  });
  it('preserves all 34 canonical competition identities in every language',()=>{
    expect(FOOTBALL_COMPETITION_TARGETS).toHaveLength(34);
    for(const c of FOOTBALL_COMPETITION_TARGETS)for(const locale of ['br','mx','en'] as const){
      expect(competitionName(locale,c.slug)).toBeTruthy();
      const path=competitionPath(locale,c.slug,{tab:'results',season:'01234567-89ab-cdef-0123-456789abcdef',page:2});
      expect(translatedPath(path,'en')).toBe(competitionPath('en',c.slug,{tab:'results',season:'01234567-89ab-cdef-0123-456789abcdef',page:2}));
    }
  });
  it('bounds pagination, search text and season IDs',()=>{
    expect(sportsPage('-1')).toBe(1);expect(sportsPage('9999')).toBe(1000);expect(sportsPage(['2'])).toBe(1);
    expect(sportsSeason('x')).toBeUndefined();expect(sportsSeason('01234567-89ab-cdef-0123-456789abcdef')).toBeTruthy();
    expect(sportsQuery('  Arsenal\u0000  ')).toBe('Arsenal');expect(sportsQuery('x'.repeat(100))).toHaveLength(80);
    expect(competitionTab('sql')).toBe('fixtures');expect(competitionTab(undefined)).toBe('fixtures');expect(competitionTab('standings')).toBe('standings');
  });
  it('does not turn absent/invalid season statistics into zero',()=>{
    for(const raw of [null,{}, {total:''},{total:-1},{total:'NaN'},{average:8}])expect(numericStatistic(raw)).toBeNull();
    expect(numericStatistic({total:0})).toBe(0);expect(numericStatistic({total:'12'})).toBe(12);
  });
  it('localizes supported stage descriptions without English fallback in PT/ES',()=>{
    expect(sportStage('br','Regular Season')).toBe('Temporada regular');expect(sportStage('mx','Quarter-finals')).toBe('Cuartos de final');
    expect(sportStage('br','Unknown provider stage')).toBeNull();expect(sportStage('en','Group Stage')).toBe('Group Stage');
  });
  it('keeps confirmed opponents and translates unresolved official draw labels',()=>{
    expect(pendingParticipant('br','Napoli')).toBe('Napoli');expect(pendingParticipant('mx','TBC')).toBe('Por definir');
    expect(pendingParticipant('br','Winner Quarter-final 4')).toBe('Vencedor · quartas de final 4');
    expect(pendingParticipant('mx','Winner Match 29')).toBe('Ganador · partido 29');
    expect(sportStage('br','1st Round Qualifying Replays')).toBe('1ª fase classificatória · desempates');
    expect(localizedCountry('br','Norway')).toBe('Noruega');expect(localizedCountry('mx','Sweden')).toBe('Suecia');
  });
  it('provides reciprocal competition SEO and excludes search results from indexing',async()=>{
    const metadata=await footballMetadata('br',Promise.resolve({competition:'premier-league',tab:'standings'}));
    expect(metadata.alternates?.canonical).toBe('/br/futebol?competition=premier-league');
    expect(metadata.alternates?.languages?.['x-default']).toBe('/en/football?competition=premier-league');
    expect((await footballMetadata('en',Promise.resolve({q:'Arsenal'}))).robots).toEqual({index:false,follow:true});
  });
  it('keeps historical canonical and language context across competition tabs',async()=>{
    const season='01234567-89ab-cdef-0123-456789abcdef';
    for(const locale of ['br','mx','en'] as const)for(const tab of ['results','standings','scorers']){
      const metadata=await footballMetadata(locale,Promise.resolve({competition:'champions-league',season,tab}));
      expect(metadata.alternates?.canonical).toBe(competitionPath(locale,'champions-league',{season}));
      expect(metadata.alternates?.languages?.['x-default']).toBe(competitionPath('en','champions-league',{season}));
      expect(metadata.title).toContain(competitionName(locale,'champions-league'));
    }
  });
});
