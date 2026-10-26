import {describe,it,expect} from 'vitest';
import {operationalCoverage,publishedCoverage,coverageLabel} from './coverage';
import {validateSnapshot,type SportsSnapshot} from './model';
import type {SnapshotRecord,RefreshState} from './repository';
const now=new Date('2026-10-26T12:00:00Z');
function snapshot():SportsSnapshot{return {schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026/27',stage:'regular-season',sourceId:'openligadb',sourceUrl:'https://api.openligadb.de/getbltable/bl1/2026',observedAt:'2026-10-26T08:00:00Z',retrievedAt:'2026-10-26T10:00:00Z',mode:'manual',entities:[{id:'test-club',name:'Synthetic test club',kind:'club'}],tables:[{type:'football',id:'overall',name:'Synthetic table',stage:'regular-season',rows:[{entityId:'test-club',rank:1,played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,goalDifference:0,points:0}]}],events:[]};}
function record():SnapshotRecord {const draft=snapshot();return {key:'bundesliga:2026/27',draft,published:structuredClone(draft),revision:1,reviewedRevision:1,reviewedAt:now.toISOString(),archived:false};}
const run:RefreshState={sourceKey:'openligadb:bl1:2026',lastAttemptAt:now.toISOString(),lastSuccessAt:'2026-10-25T10:00:00Z',nextAllowedAt:'2026-10-26T18:00:00Z',upstreamVersion:'test-version',failures:1,lastError:'UPSTREAM_HTTP_403',leaseToken:'PRIVATE-LEASE'};
const row=(records:SnapshotRecord[],refresh:RefreshState[]=[])=>operationalCoverage(records,refresh,{now}).find(r=>r.competitionId==='bundesliga')!;
describe('database-grounded operational coverage',()=>{
 it('does not promote catalog entries into published records',()=>{expect(operationalCoverage([] ,[],{now}).every(r=>r.entities===0)).toBe(true);expect(row([]).state).toBe('unavailable-source');});
 it('accepts valid test fixture and uses actual source age',()=>{expect(validateSnapshot(snapshot(),now)).toEqual([]);expect(row([record()]).state).toBe('current-verified');});
 it('retrieval and successful refresh cannot refresh old data',()=>{const r=record();r.published!.observedAt='2026-10-19T08:00:00Z';expect(row([r],[{...run,lastSuccessAt:now.toISOString(),lastError:null}]).state).toBe('dated-snapshot');});
 it('never calls a source revision a current results cutoff',()=>{const s=snapshot();s.observationBasis='source-revision';expect(publishedCoverage(s,now)).toBe('dated-snapshot');});
 it('keeps archives historical even after a new retrieval',()=>{const s=snapshot();s.mode='historical';expect(publishedCoverage(s,now)).toBe('historical-archive');});
 it('does not leak unpublished draft contents or refresh lease',()=>{const r=record();r.published=null;const result=row([r],[run]);expect(result.state).toBe('awaiting-publication');expect(JSON.stringify(result)).not.toMatch(/Synthetic test club|PRIVATE-LEASE|upstreamVersion/);expect(result.entities).toBe(0);});
 it.each(['expired','future','changed'] as const)('does not call %s review verified',kind=>{const r=record();r.published=null;if(kind==='expired')r.reviewedAt='2026-10-24T12:00:00Z';if(kind==='future')r.reviewedAt='2026-10-27T12:00:00Z';if(kind==='changed')r.reviewedRevision=0;expect(row([r]).state).toBe('unavailable-source');});
 it('does not expose archived or invalid publications as operational',()=>{const r=record();r.archived=true;expect(row([r]).entities).toBe(0);r.archived=false;r.published!.sourceId='unapproved';expect(row([r]).entities).toBe(0);});
 it('preserves the publication when refresh fails and distinguishes disabled from operational',()=>{const result=row([record()],[run]);expect(result.entities).toBe(1);expect(result.refresh).toMatchObject({enabled:false,eligible:true,attention:true,lastError:'UPSTREAM_HTTP_403',lastFailureAt:null});});
 it('alerts on an enabled source without observed executions',()=>{expect(operationalCoverage([],[],{now,automaticEnabled:true}).find(r=>r.competitionId==='bundesliga')!.refresh.attention).toBe(true);});
 it.each(['en','mx','br'] as const)('has localized public coverage labels in %s',locale=>{expect(coverageLabel('dated-snapshot',locale)).toBeTruthy();});
});
