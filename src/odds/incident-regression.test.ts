import {describe,it,expect,vi} from 'vitest';
import {classifyBackoff} from './backoff-policy';
import {matchOddsFixture} from './matching';
import {pipelineAvailability,oddsAvailabilityLabel} from './availability';
import {persistSnapshot} from './ingestion';
import {requiresMappingReview} from './scheduler';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {CanonicalOddsFixture,ProviderOddsFixture,OddsSnapshot} from './types';

describe('October 13 coverage incident',()=>{
  it('does not permanently suppress later matchweeks because an expired payload was unmappable',()=>{
    expect(requiresMappingReview({last_outcome:'MAPPING_EMPTY',unresolved_upcoming:false})).toBe(false);
    expect(requiresMappingReview({last_outcome:'MAPPING_EMPTY',unresolved_upcoming:true})).toBe(true);
    expect(requiresMappingReview({last_outcome:'PARSER_EMPTY'})).toBe(true);
    expect(requiresMappingReview({failure_class:'MAPPING',unresolved_upcoming:false})).toBe(true);
  });
  it('bounds repeated empty 404 probes without treating historical success as a 30-minute retry forever',()=>{
    expect([1,2,3,4,5,6,32].map(consecutiveFailures=>classifyBackoff({code:'ODDSPAPI_HTTP_404',neverSucceeded:false,consecutiveFailures}).delayMinutes)).toEqual([30,60,120,240,480,720,720]);
    expect(classifyBackoff({code:'ODDSPAPI_HTTP_404',neverSucceeded:true}).delayMinutes).toBe(720);
  });
  it('does not let replayed data reset newer operational failures or retry state',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:[],rowCount:sql.includes('UPDATE odds_sync_jobs')?1:0}));
    const typed=query as unknown as QueryExecutor['query'];
    const db:DatabaseClient={query:typed,transaction:async f=>f({query:typed}),close:async()=>{}};
    const snapshot:OddsSnapshot={bookmaker:'betsson',observedAt:'2026-10-13T01:30:00Z',tournamentIds:['19'],fixtures:[],quotes:[],rejected:{}};
    await persistSnapshot(db,'job',snapshot);
    const sql=query.mock.calls.find(([s])=>s.includes('INSERT INTO odds_refresh_targets'))![0];
    expect(sql).toContain('GREATEST(odds_refresh_targets.last_checked_at');
    expect(sql).toContain("odds_refresh_targets.last_attempt_at,'-infinity'::timestamptz)<=excluded.last_checked_at");
  });
  it.each([
    ['colombia-primera-a','CA Bucaramanga','Atlético Bucaramanga','Aguilas Doradas Rionegro','Rionegro Águilas'],
    ['colombia-primera-a','AD Pasto','Deportivo Pasto','Alianza FC Valledupar','Alianza Petrolera'],
    ['colombia-primera-b','Itagui Leones FC','Itagüí Leones','Boyaca Patriotas','Patriotas Boyacá'],
    ['conference-league','Kuopion Palloseura','KuPS','Trabzonspor','Trabzonspor'],
    ['conference-league','Mjallby','Mjällby','Inter Club de Escaldes',"Inter Club d'Escaldes"],
    ['conference-league','FC Copenhagen','FC København','SC Braga','Sporting Braga'],
    ['conference-league','Heart of Midlothian FC','Hearts','FC Nordsjaelland','Nordsjælland'],
    ['conference-league','St. Truidense VV','Sint-Truiden','FC Iberia 1999','FC Iberia 1999'],
    ['saudi-pro-league','Neom SC','NEOM SC','Al-Ittifaq FC','Al Ettifaq'],
    ['saudi-pro-league','Diriyah Club','Al Diraiyah FC','Al-Taawoun FC','Al Taawoun'],
    ['fa-cup','Plymouth Parkway','Plymouth Parkway','Chertsey Town FC','Chertsey Town'],
  ])('matches reviewed %s variants only with competition, both roles and kickoff intact', (competition,homeName,home,awayName,away)=>{
    const fixture:CanonicalOddsFixture={id:'fixture',competitionId:'competition',competition,sport:'FOOTBALL',status:'SCHEDULED',kickoff:'2026-10-17T14:00:00Z',homeId:'home',home,awayId:'away',away};
    const raw:ProviderOddsFixture={providerId:'provider',competition,providerCompetitionId:'tournament',sport:'FOOTBALL',status:'PREGAME',kickoff:fixture.kickoff,homeProviderId:'ph',awayProviderId:'pa',homeNames:[homeName],awayNames:[awayName]};
    expect(matchOddsFixture(raw,[fixture],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,kickoff:'2026-10-17T14:11:00Z'},[fixture],[]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture({...raw,homeNames:[awayName],awayNames:[homeName]},[fixture],[]).fixture).toBeNull();
    expect(matchOddsFixture({...raw,competition:'unapproved'},[fixture],[]).fixture).toBeNull();
    expect(matchOddsFixture(raw,[fixture],[{providerId:'different',fixtureId:'fixture',homeProviderId:'ph',awayProviderId:'pa'}]).state).toBe('AMBIGUOUS');
  });
  it('never labels unknown absence as upstream proof and localizes transient failures',()=>{
    expect(pipelineAvailability({})).toBe('UNVERIFIED');
    expect(pipelineAvailability({confirmedGap:true})).toBe('NOT_OFFERED');
    expect(pipelineAvailability({outcome:'MAPPING_EMPTY'})).toBe('INGESTION_DELAY');
    expect(pipelineAvailability({quotaBlocked:true})).toBe('QUOTA_DELAY');
    expect(pipelineAvailability({error:'ODDSPAPI_HTTP_500',confirmedGap:true})).toBe('PROVIDER_ERROR');
    expect(oddsAvailabilityLabel('co','LOADING')).toBe('Cargando cuotas…');
    expect(oddsAvailabilityLabel('pe','LOADING')).toBe('Cargando cuotas…');
    expect(oddsAvailabilityLabel('en','LOADING')).toBe('Loading odds…');
  });
});
