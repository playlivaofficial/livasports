import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl,type DatabaseClient} from '../src/database/client';
import {capturedAll} from '../src/sports/captured-provider';
import {SportsIngestionStore,object,type SeasonContext} from '../src/sports/ingestion-store';
const db=new PostgresDatabaseClient(databaseUrl()!);
const migration='020_sports_unlinked_competition_records.sql';
const rollback=new Error('SPORTS_UNLINKED_QA_ROLLBACK');let passed=false;
try{
 try{await db.transaction(async tx=>{
  if(!(await tx.query('SELECT filename FROM schema_migrations WHERE filename=$1',[migration])).rowCount)await tx.query((await readFile(`db/migrations/${migration}`,'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
  const nested:DatabaseClient={query:tx.query.bind(tx),transaction:async work=>work(tx),close:async()=>{}};
  const store=new SportsIngestionStore(nested);
  for(const [id,capability] of [[12945,'SCORERS'],[5335,'STANDINGS']] as const){
   const r=(await tx.query(`SELECT s.id,s.name,s.competition_id,lm.provider_entity_id AS league FROM seasons s JOIN provider_entity_mappings m ON m.livasports_entity_id=s.id AND m.provider='SPORTMONKS' AND m.entity_type='SEASON' JOIN provider_entity_mappings lm ON lm.livasports_entity_id=s.competition_id AND lm.provider='SPORTMONKS' AND lm.entity_type='COMPETITION' WHERE m.provider_entity_id=$1`,[String(id)])).rows[0];assert.ok(r);
   const season:SeasonContext={id:r.id,name:r.name,competitionId:r.competition_id,league:r.league,providerId:id};
   const source=await capturedAll(`football/${capability==='SCORERS'?'topscorers':'standings'}/seasons/${id}`,{include:capability==='SCORERS'?'player;participant;type':'participant;details.type;stage;group;rule;form'});
   assert.equal(source.status,200);
   source.data=[...source.data.filter(row=>!object(row.participant).id).slice(0,3),...source.data.filter(row=>object(row.participant).id).slice(0,2)];
   for(let repeat=0;repeat<2;repeat++)assert.equal(await(capability==='SCORERS'?store.scorers(season,source.data):store.standings(season,source.data)),source.data.length);
   const unlinked=(await tx.query('SELECT * FROM sports_unlinked_competition_records WHERE season_id=$1 AND capability=$2',[season.id,capability])).rows;
   const expected=source.data.filter(row=>!object(row.participant).id);assert.equal(unlinked.length,expected.length);assert.ok(unlinked.length);
   for(const row of unlinked){assert.equal(row.team_id,null);assert.equal(row.reason,'TEAM_NOT_EXPANDED');assert.deepEqual(row.payload,expected.find(e=>String(e.id)===row.provider_record_id));if(capability==='SCORERS')assert.ok(row.player_id);}
   const linked=(await tx.query(`SELECT ${capability==='SCORERS'?'provider_record_id':'provider_standing_id'} AS id FROM ${capability==='SCORERS'?'season_topscorers':'standings_current'} WHERE season_id=$1`,[season.id])).rows;
   assert.deepEqual([...linked.map(row=>String(row.id)),...unlinked.map(row=>String(row.provider_record_id))].sort(),source.data.map(row=>String(row.id)).sort());
   assert.equal((await tx.query(`SELECT count(*)::int AS n FROM provider_entity_mappings m JOIN teams t ON t.id=m.livasports_entity_id WHERE m.provider='SPORTMONKS' AND m.entity_type='TEAM' AND m.provider_entity_id=ANY($1::text[])`,[expected.map(row=>String(row.participant_id))])).rows[0].n,0);
  }
  passed=true;throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 assert.ok(passed);console.log(JSON.stringify({status:'PASS',rollback:true,migrationPersisted:false,exactSourceRecords:true,idempotent:true,fabricatedEntities:0,providerRequests:0}));
}catch(error){console.error(JSON.stringify({status:'FAIL',assertion:error instanceof assert.AssertionError?error.message:null,code:error&&typeof error==='object'&&'code'in error?error.code:null,providerRequests:0}));process.exitCode=1;}finally{await db.close();}
