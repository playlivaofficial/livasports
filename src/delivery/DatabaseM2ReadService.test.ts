import {describe,it,expect,vi} from 'vitest';
import {DatabaseM2ReadService} from './DatabaseM2ReadService';
import type {FixtureReadRecord} from '@/ingestion/store';
describe('competition schedule horizon',()=>{
 it('uses the selected calendar day even at UTC+14 and keeps timezone-specific boundaries',async()=>{
   const kickoff=new Date('2026-09-13T11:00:00Z');
   const record={fixture:{id:'fixture',kickoff,status:'FINISHED',homeScore:1,awayScore:0},competitionName:'League',competitionSlug:'league',competitionGroup:'EUROPE',competitionPriority:1,homeTeamName:'Home',awayTeamName:'Away'} as FixtureReadRecord;
   const listFixtures=vi.fn(async(_country:string,from:Date,to:Date)=>kickoff>=from&&kickoff<to?[record]:[]);
   const service=new DatabaseM2ReadService({listFixtures,listCompetitions:async()=>[]});
   const data=await service.loadOrThrow('br','football','2026-09-14','Pacific/Kiritimati');
   expect(data.sections[0].fixtures).toHaveLength(1);expect(data.timeZone).toBe('Pacific/Kiritimati');expect(data.paidOddsRequests).toBe(0);
   expect(listFixtures.mock.calls[0].slice(1,3)).toEqual([new Date('2026-09-13T10:00:00Z'),new Date('2026-09-14T10:00:00Z')]);
 });
 it('shows an offered future round immediately when opening a competition, while date navigation remains exact',async()=>{
   const now=new Date('2026-09-13T19:00:00Z'),kickoff=new Date('2026-09-24T19:00:00Z');
   const record={fixture:{id:'future-fixture',kickoff,status:'SCHEDULED',homeScore:null,awayScore:null},competitionName:'Europa League',competitionSlug:'europa-league',competitionGroup:'EUROPE',competitionPriority:1,homeTeamName:'Home',awayTeamName:'Away'} as FixtureReadRecord;
   const listFixtures=vi.fn(async(_country:'BR'|'MX',from:Date,to:Date,_statuses?:readonly string[],slug?:string)=>kickoff>=from&&kickoff<to&&(!slug||slug===record.competitionSlug)?[record]:[]);
   const service=new DatabaseM2ReadService({listFixtures,listCompetitions:async()=>[{competitionName:'Europa League',competitionSlug:'europa-league',competitionGroup:'EUROPE',competitionPriority:1}]},()=>now);
   expect((await service.loadOrThrow('br','football')).sections[0].fixtures).toHaveLength(0);
   expect((await service.loadOrThrow('br','football',undefined,undefined,'europa-league')).sections[0].fixtures).toHaveLength(1);
   expect((await service.loadOrThrow('br','football','2026-09-24',undefined,'europa-league')).sections[0].fixtures).toHaveLength(1);
   expect((await service.loadOrThrow('br','football','2026-09-23',undefined,'europa-league')).sections[0].fixtures).toHaveLength(0);
 });
});
