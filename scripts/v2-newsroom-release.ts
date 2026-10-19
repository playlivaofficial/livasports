/** Explicit, bounded editorial release operations. Load only DATABASE_URL in the caller's
 * memory. No provider IO, credentials in output, environment-file writes or old-data changes. */
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '../src/database/client';
import {runMigrations} from '../src/database/migrate';
import {NewsRepository} from '../src/editorial/repository';
import {initialNews} from '../src/editorial/seed';
import {validateNewsDraft} from '../src/editorial/model';

const migration='072_v2_editorial_newsroom.sql',mode=process.argv[2]??'audit';
if(!['audit','migrate','verify','seed'].includes(mode))throw Error('UNKNOWN_EDITORIAL_OPERATION');
const url=databaseUrl();if(!url)throw Error('DATABASE_URL_REQUIRED');
const db=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:10000});
try{
 const files=(await readdir(resolve('db/migrations'))).filter(name=>/^\d+.*\.sql$/.test(name));
 const history=await db.query<{filename:string}>('SELECT filename FROM schema_migrations ORDER BY filename');
 const known=new Set(history.rows.map(row=>row.filename)),pending=files.filter(file=>!known.has(file));
 if(mode==='audit')console.log(JSON.stringify({latestMigration:history.rows.at(-1)?.filename,pending,providerRequests:0}));
 if(mode==='migrate'){
  if(pending.some(file=>file!==migration))throw Error('UNRELATED_PENDING_MIGRATION');
  const applied=await runMigrations(db);const repeat=await runMigrations(db);
  console.log(JSON.stringify({applied,idempotent:repeat.length===0,providerRequests:0}));
 }
 if(mode==='verify'){
  // Session-local shadow tables exercise the real SQL repository. They are dropped
  // on transaction completion and cannot touch public news or pre-existing data.
  const raw=await readFile(resolve('db/migrations',migration),'utf8');
  const temporary=raw.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'').replaceAll('CREATE TABLE IF NOT EXISTS editorial_news','CREATE TEMP TABLE editorial_news').replaceAll(');\nCREATE INDEX',') ON COMMIT DROP;\nCREATE INDEX');
  await db.transaction(async query=>{
   await query.query(temporary);
   const scoped:DatabaseClient={query:query.query.bind(query),transaction:async work=>work(query),close:async()=>{}};
   const repo=new NewsRepository(scoped),draft={...initialNews[0],slug:'qa-newsroom-transaction'};
   let row=await repo.mutate({action:'create',slug:draft.slug,revision:0,draft});
   if((await repo.listPublished()).length)throw Error('DRAFT_LEAK');
   row=await repo.mutate({action:'review',slug:row.slug,revision:row.revision});row=await repo.mutate({action:'publish',slug:row.slug,revision:row.revision});
   const first=row.published;row=await repo.mutate({action:'publish',slug:row.slug,revision:row.revision});
   if(JSON.stringify(first)!==JSON.stringify(row.published))throw Error('NON_IDEMPOTENT_PUBLISH');
   row=await repo.mutate({action:'save',slug:row.slug,revision:row.revision,draft:{...draft,title:{...draft.title,en:draft.title.en+' — updated'}}});
   if((await repo.findPublished(row.slug))?.title.en!==draft.title.en)throw Error('DRAFT_UPDATE_LEAK');
   let blocked=0;try{await repo.mutate({action:'publish',slug:row.slug,revision:row.revision});}catch{blocked++;}
   try{await repo.mutate({action:'save',slug:row.slug,revision:1,draft});}catch{blocked++;}
   if(blocked!==2)throw Error('REVIEW_OR_CONCURRENCY_BYPASS');
   row=await repo.mutate({action:'review',slug:row.slug,revision:row.revision});row=await repo.mutate({action:'publish',slug:row.slug,revision:row.revision});
   if(row.published?.publishedAt!==first?.publishedAt)throw Error('PUBLICATION_DATE_REWRITTEN');
   await repo.mutate({action:'archive',slug:row.slug,revision:row.revision});
   if(await repo.findPublished(row.slug))throw Error('ARCHIVE_LEAK');
   const audits=await query.query<{count:string}>('SELECT count(*) FROM editorial_news_audit');
   console.log(JSON.stringify({temporaryDatabaseQa:'PASS',draftIsolation:true,reviewGate:true,concurrency:true,idempotency:true,archive:true,auditRecords:Number(audits.rows[0].count),providerRequests:0}));
  });
 }
 if(mode==='seed'){
  if(!process.argv.includes('--publish-reviewed'))throw Error('EXPLICIT_REVIEWED_PUBLICATION_REQUIRED');
  if(!known.has(migration))throw Error('MIGRATION_REQUIRED');
  if(Date.now()>Date.parse('2026-10-21T11:13:31Z'))throw Error('SOURCE_REVERIFICATION_REQUIRED');
  const repo=new NewsRepository(db),existing=new Set((await repo.listOwner()).map(row=>row.slug));
  let published=0,skipped=0;
  for(const draft of initialNews){
   if(existing.has(draft.slug)){skipped++;continue;}
   if(validateNewsDraft(draft).length)throw Error('REVIEWED_COLLECTION_INVALID');
   let row=await repo.mutate({action:'create',slug:draft.slug,revision:0,draft});
   row=await repo.mutate({action:'review',slug:draft.slug,revision:row.revision});
   await repo.mutate({action:'publish',slug:draft.slug,revision:row.revision});published++;
  }
  console.log(JSON.stringify({published,skipped,publicStories:(await repo.listPublished()).length,existingDraftsNeverOverwritten:true,providerRequests:0}));
 }
}catch(error){const safe=new Set(['UNRELATED_PENDING_MIGRATION','DRAFT_LEAK','NON_IDEMPOTENT_PUBLISH','DRAFT_UPDATE_LEAK','REVIEW_OR_CONCURRENCY_BYPASS','PUBLICATION_DATE_REWRITTEN','ARCHIVE_LEAK','EXPLICIT_REVIEWED_PUBLICATION_REQUIRED','MIGRATION_REQUIRED','SOURCE_REVERIFICATION_REQUIRED','REVIEWED_COLLECTION_INVALID']);console.error(safe.has((error as Error).message)?(error as Error).message:'EDITORIAL_OPERATION_FAILED');process.exitCode=1;}finally{await db.close();}
