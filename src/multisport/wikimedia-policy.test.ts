import {describe,expect,it} from 'vitest';
import {snapshotFreshness,validateSnapshot,type SportsSnapshot} from './model';
import {isApprovedSourceForCompetition,isApprovedSourceUrl} from './sources';
import {WIKIMEDIA_DATASETS} from './wikimedia-datasets';

const now=new Date('2026-10-19T12:00:00Z');
/** Synthetic TEST-only table, never imported or published. */
function sample():SportsSnapshot {
 const dataset=WIKIMEDIA_DATASETS.find(item=>item.competitionId==='liga-mx')!;
 return {schemaVersion:1,competitionId:dataset.competitionId,sport:'football',season:dataset.season,stage:'test',sourceId:'wikimedia',sourceUrl:dataset.sourceUrl,mode:'manual',observedAt:'2026-10-18',retrievedAt:'2026-10-19T10:00:00Z',observationBasis:'data-date',provenance:dataset.titles.map(title=>({title,revisionId:123,revisionTimestamp:'2026-10-19T01:00:00Z',dataAsOf:'2026-10-18'})),entities:[{id:'test-a',name:'Synthetic Club A',kind:'club'}],tables:[{id:'test-table',name:'Synthetic table',stage:'test',type:'football',rows:[{entityId:'test-a',rank:1,played:1,won:1,drawn:0,lost:0,goalsFor:1,goalsAgainst:0,goalDifference:1,points:3}]}],events:[]};
}
describe('Wikimedia provenance and freshness boundary',()=>{
 it('accepts explicit source dates without invented UTC kickoff times',()=>{
  expect(validateSnapshot(sample(),now)).toEqual([]);
  expect(snapshotFreshness(sample(),now).status).toBe('stale');
 });
 it('never calls a recent edit timestamp fresh result data',()=>{
  const s=sample();s.observationBasis='source-revision';s.observedAt='2026-10-19T01:00:00Z';delete s.provenance![0].dataAsOf;
  expect(validateSnapshot(s,now)).toEqual([]);expect(snapshotFreshness(s,now).status).toBe('unconfirmed');
 });
 it('requires every exact reviewed source page, revision and data date',()=>{
  for(const mutate of [(s:SportsSnapshot)=>{s.provenance=[];},(s:SportsSnapshot)=>{s.provenance![0].title='Unreviewed page';},(s:SportsSnapshot)=>{s.provenance![0].revisionId=0;},(s:SportsSnapshot)=>{delete s.provenance![0].dataAsOf;},(s:SportsSnapshot)=>{s.provenance!.push({...s.provenance![0]});}]){
   const s=sample();mutate(s);expect(validateSnapshot(s,now).length).toBeGreaterThan(0);
  }
 });
 it('rejects fabricated cutoff advancement, future data and automatic publication',()=>{
  for(const mutate of [(s:SportsSnapshot)=>{s.observedAt='2026-10-19';},(s:SportsSnapshot)=>{s.provenance![0].dataAsOf='2026-10-20';},(s:SportsSnapshot)=>{s.provenance![0].revisionTimestamp='2026-10-20T00:00:00Z';},(s:SportsSnapshot)=>{s.mode='automatic';},(s:SportsSnapshot)=>{s.season='2025';}]){
   const s=sample();mutate(s);expect(validateSnapshot(s,now).length).toBeGreaterThan(0);
  }
 });
 it('does not let another source use revision fields or a Wikipedia page grant global permission',()=>{
  const s=sample();s.sourceId='openligadb';expect(validateSnapshot(s,now).join(' ')).toContain('revision provenance');
  expect(isApprovedSourceUrl('wikimedia','https://en.wikipedia.org/wiki/Sports')).toBe(false);
  expect(isApprovedSourceForCompetition('wikimedia','bundesliga','football',sample().sourceUrl,'2026/27')).toBe(false);
 });
 it('keeps completed MLB historical and absent run statistics absent',()=>{
  const d=WIKIMEDIA_DATASETS.find(item=>item.competitionId==='mlb')!,s=sample();
  Object.assign(s,{competitionId:d.competitionId,sport:d.sport,season:d.season,sourceUrl:d.sourceUrl,mode:'historical',observationBasis:'source-revision',observedAt:'2026-10-19T01:00:00Z',provenance:d.titles.map(title=>({title,revisionId:123,revisionTimestamp:'2026-10-19T01:00:00Z'})),tables:[{id:'test',type:'baseball',name:'Synthetic division',stage:'regular-season',rows:[{entityId:'test-a',rank:1,played:162,wins:90,losses:72,winPercentage:90/162,gamesBehind:0}]}]});
  expect(validateSnapshot(s,now)).toEqual([]);expect(snapshotFreshness(s,now).status).toBe('historical');
  expect(s.tables[0].rows[0]).not.toHaveProperty('runsFor');s.mode='manual';expect(validateSnapshot(s,now).join(' ')).toContain('historical edition');
 });
});
