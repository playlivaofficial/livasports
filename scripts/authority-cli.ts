import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '../src/database/client';
import {authorityProspects} from '../src/authority/prospects';
import {authorityMutation,readAuthority,validateProspect} from '../src/authority/repository';
import {classify,METHODOLOGY} from '../src/authority/model';
import {runAuthorityMonitor} from '../src/authority/monitor';
const command=process.argv[2];
if(!['validate','db-qa','migrate','seed','verify','monitor'].includes(command))throw Error('COMMAND_REQUIRED');
for(const p of authorityProspects)validateProspect(p);
assert.equal(new Set(authorityProspects.map(p=>new URL(p.url).hostname.replace(/^www\./,''))).size,authorityProspects.length);
if(command==='validate'){console.log(JSON.stringify({prospects:authorityProspects.length,priorities:authorityProspects.reduce((a,p)=>{const k=classify(p.research,!!p.contactUrl).priority;a[k]=(a[k]??0)+1;return a;},{} as Record<string,number>)}));}
else {
const connection=databaseUrl();if(!connection)throw Error('DATABASE_UNAVAILABLE');const db=new PostgresDatabaseClient(connection);
try{
 const filename='047_authority_engine.sql',sql=(await readFile(new URL('../db/migrations/'+filename,import.meta.url),'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
 if(command==='migrate'){await db.transaction(async tx=>{await tx.query(`SELECT pg_advisory_xact_lock(hashtext('authority-migration-047'))`);if((await tx.query('SELECT filename FROM schema_migrations WHERE filename=$1',[filename])).rowCount)return;await tx.query(sql);await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);});console.log(JSON.stringify({migration:filename,status:'APPLIED_OR_ALREADY_APPLIED'}));}
 if(command==='db-qa'){
 let passed=false;try{await db.transaction(async tx=>{await tx.query(sql);const wrapper:DatabaseClient={query:tx.query.bind(tx),transaction:async fn=>fn(tx),close:async()=>{}};
 const created=await authorityMutation(wrapper,{action:'create',...authorityProspects[0],url:'https://authority-qa.example.com',name:'Authority QA rollback',isQa:true,research:{...authorityProspects[0].research,sectionUrl:'https://authority-qa.example.com',evidenceUrl:'https://authority-qa.example.com'}},'authority-db-qa');assert.ok('id' in created);const id='id' in created?created.id:'';
 await assert.rejects(authorityMutation(wrapper,{action:'create',...authorityProspects[0],url:'https://authority-qa.example.com',research:{...authorityProspects[0].research,sectionUrl:'https://authority-qa.example.com',evidenceUrl:'https://authority-qa.example.com'}},'authority-db-qa'),/DUPLICATE_DOMAIN/);
 for(const status of ['RESEARCHED','READY_TO_CONTACT','CONTACTED','INTERESTED'])await authorityMutation(wrapper,{action:'status',id,status,confirmSent:true},'authority-db-qa');
 await authorityMutation(wrapper,{action:'follow-up',id,date:'2026-10-01'},'authority-db-qa');
 await authorityMutation(wrapper,{action:'link',id,sourceUrl:'https://authority-qa.example.com/article',targetUrl:METHODOLOGY},'authority-db-qa');
 await assert.rejects(authorityMutation(wrapper,{action:'link',id,sourceUrl:'https://authority-qa.example.com/article',targetUrl:METHODOLOGY},'authority-db-qa'),/DUPLICATE_LINK/);
 await assert.rejects(authorityMutation(wrapper,{action:'status',id,status:'LINK_LIVE'},'authority-db-qa'),/VERIFIED_LINK_REQUIRED/);
 const report=await readAuthority(wrapper);assert.ok(report.events.filter(e=>e.prospectId===id).length>=7);assert.equal(report.prospects.find(p=>p.id===id)?.status,'INTERESTED');assert.equal(report.prospects.find(p=>p.id===id)?.followUpOn,'2026-10-01');passed=true;throw Error('QA_ROLLBACK');});}catch(e){if(!(e instanceof Error&&e.message==='QA_ROLLBACK'))throw e;}
 assert.ok(passed);console.log(JSON.stringify({dbQA:'PASS',persistence:'ROLLED_BACK',checks:['additive schema','create','domain duplicate','status lineage','manual contact','follow-up','backlink duplicate','verified gate','HUMAN referral query']}));
 }
 if(command==='seed'){let added=0;for(const p of authorityProspects){try{const row=await authorityMutation(db,{action:'create',...p},'authority-research-2026-09-27');if('id' in row){await authorityMutation(db,{action:'status',id:row.id,status:'RESEARCHED',note:'Pesquisa pública documentada; envio manual pendente.'},'authority-research-2026-09-27');added++;}}catch(e){if(!(e instanceof Error&&e.message==='DUPLICATE_DOMAIN'))throw e;}}console.log(JSON.stringify({added,skippedExisting:authorityProspects.length-added,contacted:0}));}
 if(command==='verify'){const report=await readAuthority(db);console.log(JSON.stringify({prospects:report.prospects.length,links:report.links.length,events:report.events.length,referrals:report.referrals,runs:report.runs,priorities:report.prospects.reduce((a,p)=>{a[p.priority]=(a[p.priority]??0)+1;return a;},{} as Record<string,number>)}));}
 if(command==='monitor')console.log(JSON.stringify(await runAuthorityMonitor(db)));
}finally{await db.close();}
}
