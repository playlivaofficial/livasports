import {describe,it,expect,vi} from 'vitest';
import type {DatabaseClient} from '@/database/client';
import type {SportsSnapshot} from './model';
import {snapshotHash,snapshotKey,transitionSnapshot,SportsRepository,type SnapshotRecord} from './repository';
import {WIKIMEDIA_DATASETS} from './wikimedia-datasets';

const now=new Date('2026-10-19T12:00:00Z');
function draft():SportsSnapshot{return {schemaVersion:1,competitionId:'premier-league',sport:'football',season:'2026/27',stage:'League',sourceId:'openfootball',sourceUrl:'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json',observedAt:'2026-09-20',retrievedAt:now.toISOString(),mode:'historical',entities:[{id:'test-a',name:'Test club A',kind:'club'},{id:'test-b',name:'Test club B',kind:'club'}],tables:[],events:[{id:'test-1',stage:'League',homeId:'test-a',awayId:'test-b',start:'2026-09-18T12:00:00Z',status:'completed',scores:{home:1,away:0}}]};}
function record():SnapshotRecord{const d=draft();return {key:snapshotKey(d),draft:d,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};}
describe('snapshot publication workflow',()=>{
  it('requires review and an exact optimistic revision',()=>{const r=record();expect(()=>transitionSnapshot(r,{action:'publish',key:r.key,revision:1},now)).toThrow('REVIEW_REQUIRED');expect(()=>transitionSnapshot(r,{action:'review',key:r.key,revision:2},now)).toThrow('REVISION_CONFLICT');});
  it('review then publish is explicit; subsequent edits preserve the publication',()=>{const r=record(),reviewed=transitionSnapshot(r,{action:'review',key:r.key,revision:1},now),published=transitionSnapshot(reviewed,{action:'publish',key:r.key,revision:1},now),changed=structuredClone(r.draft);changed.events[0].scores={home:2,away:0};const saved=transitionSnapshot(published,{action:'save',key:r.key,revision:1,draft:changed},now);expect(saved.published?.events[0].scores?.home).toBe(1);expect(saved.draft.events[0].scores?.home).toBe(2);expect(saved.revision).toBe(2);expect(saved.reviewedAt).toBeNull();});
  it('archive preserves data and clears approval; old mutation cannot resurrect it',()=>{const r=record(),reviewed=transitionSnapshot(r,{action:'review',key:r.key,revision:1},now),published=transitionSnapshot(reviewed,{action:'publish',key:r.key,revision:1},now),archived=transitionSnapshot(published,{action:'archive',key:r.key,revision:1},now);expect(archived.archived).toBe(true);expect(archived.published).toEqual(r.draft);expect(()=>transitionSnapshot(archived,{action:'publish',key:r.key,revision:1},now)).toThrow('REVISION_CONFLICT');});
  it('hash-based idempotency ignores re-fetch time but not source observation',()=>{const r=record(),d=structuredClone(r.draft);d.retrievedAt='2026-10-19T12:01:00Z';expect(snapshotHash(d)).toBe(snapshotHash(r.draft));expect(transitionSnapshot(r,{action:'save',key:r.key,revision:1,draft:d},new Date(d.retrievedAt))).toBe(r);d.observedAt='2026-10-18T12:01:00Z';expect(snapshotHash(d)).not.toBe(snapshotHash(r.draft));});
  it('rejects images, unapproved sources and stale reviews before publication',()=>{const r=record();(r.draft.entities[0] as unknown as Record<string,unknown>).logoUrl='https://example.org/logo.png';expect(()=>transitionSnapshot(r,{action:'review',key:r.key,revision:1},now)).toThrow('INVALID_SNAPSHOT');const s=record();s.draft.sourceId='nba';expect(()=>transitionSnapshot(s,{action:'review',key:s.key,revision:1},now)).toThrow('INVALID_SNAPSHOT');const fresh=record();fresh.reviewedRevision=1;fresh.reviewedAt='2026-10-17T00:00:00Z';expect(()=>transitionSnapshot(fresh,{action:'publish',key:fresh.key,revision:1},now)).toThrow('REVIEW_REQUIRED');});
});
describe('durable refresh reservation',()=>{
  it('repeating an identical import is idempotent without another audit write',async()=>{
    const existing=record(),query=vi.fn(async(text:string)=>({rows:text.includes('count(*)')?[{count:'0'}]:text.includes('FOR UPDATE')?[existing]:[],rowCount:1}));
    const db={query,transaction:async(work:(db:unknown)=>Promise<unknown>)=>work({query}),close:async()=>undefined} as unknown as DatabaseClient;
    const imported=await new SportsRepository(db).mutate({action:'create',key:existing.key,revision:0,draft:existing.draft},now);
    expect(imported).toBe(existing);expect(query.mock.calls.some(call=>call[0].startsWith('INSERT'))).toBe(false);
  });
  it('read boundaries withhold publications whose provenance is no longer approved',async()=>{
    const invalid=draft();invalid.sourceId='nba';const query=vi.fn(async()=>({rows:[{published:invalid}],rowCount:1}));
    const db={query,transaction:async()=>undefined,close:async()=>undefined} as unknown as DatabaseClient,repo=new SportsRepository(db);
    expect(await repo.listPublished()).toEqual([]);expect(await repo.findPublished('premier-league')).toBeNull();
  });
  it('does not let a newer invalid stored record hide a valid publication',async()=>{
    const valid=draft(),invalid=structuredClone(valid);invalid.sourceId='nba';invalid.observedAt='2026-10-19T00:00:00Z';
    const query=vi.fn(async()=>({rows:[{published:invalid},{published:valid},{published:null}],rowCount:3}));
    const db={query,transaction:async()=>undefined,close:async()=>undefined} as unknown as DatabaseClient,repo=new SportsRepository(db);
    expect(await repo.findPublished('premier-league')).toEqual(valid);expect(await repo.listPublished()).toEqual([valid]);
  });
  it('commits the six-hour plus jitter gate before returning a lease',async()=>{
    const query=vi.fn(async(text:string)=>({rows:text.includes('AS locked')?[{locked:true}]:text.includes('FOR UPDATE')?[{nextAllowedAt:now.toISOString(),upstreamVersion:null}]:[],rowCount:1}));
    const db={query,transaction:async(work:(db:unknown)=>Promise<unknown>)=>work({query}),close:async()=>undefined} as unknown as DatabaseClient;
    const repo=new SportsRepository(db),claim=await repo.claimRefresh('openligadb:bl1:2026',now,60000);expect(claim.claimed).toBe(true);
    const update=query.mock.calls.find(call=>call[0].startsWith('UPDATE sports_source_refresh')) as unknown as [string,unknown[]];expect(update[1][3]).toBe('2026-10-19T18:01:00.000Z');
  });
  it('honors the persistent next-allowed time, even for manual attempts',async()=>{
    const query=vi.fn(async(text:string)=>({rows:text.includes('AS locked')?[{locked:true}]:text.includes('FOR UPDATE')?[{nextAllowedAt:'2026-10-19T18:00:00Z',upstreamVersion:null}]:[],rowCount:1}));
    const db={query,transaction:async(work:(db:unknown)=>Promise<unknown>)=>work({query}),close:async()=>undefined} as unknown as DatabaseClient;
    expect(await new SportsRepository(db).claimRefresh('openligadb:bl1:2026',now)).toMatchObject({claimed:false,reason:'not-due'});expect(query.mock.calls.some(call=>call[0].startsWith('UPDATE'))).toBe(false);
  });
});

/** Transactional query double, not an execution test against PostgreSQL or production data. */
function memoryStorage(){
  const state={records:new Map<string,SnapshotRecord>(),audits:[] as string[],rejectAudit:false};
  const query=vi.fn(async(sql:string,values:readonly unknown[]=[])=>{
    let rows:unknown[]=[];
    if(sql.includes('count(*)'))rows=[{count:String(state.audits.length)}];
    else if(sql.includes('FROM sports_snapshots')&&sql.includes('FOR UPDATE')){const row=state.records.get(String(values[0]));if(row)rows=[structuredClone(row)];}
    else if(sql.startsWith('INSERT INTO sports_snapshots(')){
      const value=JSON.parse(String(values[3])) as SportsSnapshot;
      state.records.set(String(values[0]),{key:String(values[0]),draft:value,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false});
    }else if(sql.startsWith('UPDATE sports_snapshots SET')){
      state.records.set(String(values[0]),{key:String(values[0]),draft:JSON.parse(String(values[1])),published:values[2]?JSON.parse(String(values[2])):null,revision:Number(values[3]),reviewedRevision:values[4]===null?null:Number(values[4]),reviewedAt:values[5]===null?null:String(values[5]),archived:Boolean(values[6])});
    }else if(sql.startsWith('INSERT INTO sports_snapshot_audit')){
      if(state.rejectAudit)throw new Error('SIMULATED_AUDIT_FAILURE');
      state.audits.push(String(values[1]));
    }else if(sql.includes('SELECT published FROM sports_snapshots')){
      rows=[...state.records.values()].filter(row=>row.published&&!row.archived&&(!values[0]||row.published.competitionId===values[0])&&(!values[1]||row.published.season===values[1])).map(row=>({published:structuredClone(row.published)}));
    }
    return {rows,rowCount:rows.length};
  });
  const transaction=async(work:(db:unknown)=>Promise<unknown>)=>{
    const beforeRecords=structuredClone(state.records),beforeAudits=[...state.audits];
    try{return await work({query});}catch(error){state.records=beforeRecords;state.audits=beforeAudits;throw error;}
  };
  return {state,query,repo:new SportsRepository({query,transaction,close:async()=>undefined} as unknown as DatabaseClient)};
}

describe('repository mutation-to-publication integration (isolated transaction double)',()=>{
  it('preserves public version through edits, requires new review, and archives without deleting history',async()=>{
    const {repo,state}=memoryStorage(),value=draft(),key=snapshotKey(value);
    let row=await repo.mutate({action:'create',key,revision:0,draft:value},now);
    expect(await repo.listPublished()).toEqual([]);
    await expect(repo.mutate({action:'publish',key,revision:row.revision},now)).rejects.toThrow('REVIEW_REQUIRED');
    row=await repo.mutate({action:'review',key,revision:row.revision},now);
    row=await repo.mutate({action:'publish',key,revision:row.revision},now);
    expect(await repo.findPublished(value.competitionId)).toEqual(value);
    const changed=structuredClone(value);changed.events[0].scores={home:2,away:0};
    row=await repo.mutate({action:'save',key,revision:row.revision,draft:changed},now);
    expect((await repo.findPublished(value.competitionId))?.events[0].scores?.home).toBe(1);
    await expect(repo.mutate({action:'publish',key,revision:row.revision},now)).rejects.toThrow('REVIEW_REQUIRED');
    await repo.mutate({action:'archive',key,revision:row.revision},now);
    expect(await repo.listPublished()).toEqual([]);expect(await repo.findPublished(value.competitionId)).toBeNull();
    expect(state.records.get(key)?.published).toEqual(value);
    expect(state.audits).toEqual(['create','review','publish','save','archive']);
  });
  it('rolls record and publication changes back if audit insertion fails',async()=>{
    const {repo,state}=memoryStorage(),value=draft(),key=snapshotKey(value);
    await repo.mutate({action:'create',key,revision:0,draft:value},now);
    await repo.mutate({action:'review',key,revision:1},now);
    state.rejectAudit=true;
    await expect(repo.mutate({action:'publish',key,revision:1},now)).rejects.toThrow('SIMULATED_AUDIT_FAILURE');
    expect(state.records.get(key)?.published).toBeNull();expect(state.audits).toEqual(['create','review']);
  });
  it('accepts the exact approved Liga MX edition key including parentheses',async()=>{
    const {repo}=memoryStorage(),config=WIKIMEDIA_DATASETS.find(item=>item.competitionId==='liga-mx')!;
    const entities=Array.from({length:18},(_,index)=>({id:`test-mx-${index}`,name:`Synthetic unit club ${index}`,kind:'club' as const}));
    const value:SportsSnapshot={schemaVersion:1,competitionId:config.competitionId,sport:'football',season:config.season,stage:'Torneo Apertura',sourceId:'wikimedia',sourceUrl:config.sourceUrl,observedAt:'2026-10-18',retrievedAt:now.toISOString(),mode:'manual',observationBasis:'data-date',provenance:[{title:config.titles[0],revisionId:123,revisionTimestamp:'2026-10-19T03:48:30Z',dataAsOf:'2026-10-18'}],entities,tables:[{type:'football',id:'apertura',name:'Synthetic unit table',stage:'Torneo Apertura',rows:entities.map((entity,index)=>({entityId:entity.id,rank:index+1,played:2,won:1,drawn:0,lost:1,goalsFor:1,goalsAgainst:1,goalDifference:0,points:3}))}],events:[]};
    const key=snapshotKey(value);expect(key).toBe('liga-mx:Apertura 2026 (2026-2027)');
    expect((await repo.mutate({action:'create',key,revision:0,draft:value},now)).key).toBe(key);
    await expect(repo.mutate({action:'create',key:"liga-mx:2026'; DROP TABLE sports_snapshots",revision:0,draft:value},now)).rejects.toThrow('INVALID_MUTATION');
  });
  it('requires a new review after 24 hours and rejects a review from the future',async()=>{
    const {repo,state}=memoryStorage(),value=draft(),key=snapshotKey(value);
    await repo.mutate({action:'create',key,revision:0,draft:value},now);
    await repo.mutate({action:'review',key,revision:1},now);
    await expect(repo.mutate({action:'publish',key,revision:1},new Date(now.getTime()+86400001))).rejects.toThrow('REVIEW_REQUIRED');
    state.records.get(key)!.reviewedAt=new Date(now.getTime()+1).toISOString();
    await expect(repo.mutate({action:'publish',key,revision:1},now)).rejects.toThrow('REVIEW_REQUIRED');
    expect(state.records.get(key)?.published).toBeNull();
  });
});
