import assert from 'node:assert/strict';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
const mode=process.argv[2]??'audit';assert.ok(['audit','rehearse','repair'].includes(mode));
const db=new PostgresDatabaseClient(databaseUrl()!),rollback=new Error('SPORTS_ASSOCIATION_ROLLBACK');
let report:unknown;
try{
 try{await db.transaction(async tx=>{
  if(mode==='audit')await tx.query('SET TRANSACTION READ ONLY');
  const candidates=(await tx.query(`SELECT
    (SELECT count(*)::int FROM sports_unlinked_competition_records u JOIN provider_entity_mappings m ON m.provider='SPORTMONKS' AND m.entity_type='TEAM' AND m.provider_entity_id=u.provider_participant_id::text JOIN teams t ON t.id=m.livasports_entity_id WHERE u.team_id IS NULL) AS teams,
    (SELECT count(*)::int FROM sports_unlinked_competition_records u JOIN player_provider_mappings m ON m.provider='SPORTMONKS' AND m.provider_player_id=u.provider_player_id::text JOIN players p ON p.id=m.player_id WHERE u.capability='SCORERS' AND u.player_id IS NULL) AS players`)).rows[0];
  if(mode!=='audit'){
   const teams=await tx.query(`UPDATE sports_unlinked_competition_records u SET team_id=m.livasports_entity_id FROM provider_entity_mappings m JOIN teams t ON t.id=m.livasports_entity_id WHERE m.provider='SPORTMONKS' AND m.entity_type='TEAM' AND m.provider_entity_id=u.provider_participant_id::text AND u.team_id IS NULL`);
   const players=await tx.query(`UPDATE sports_unlinked_competition_records u SET player_id=m.player_id FROM player_provider_mappings m JOIN players p ON p.id=m.player_id WHERE m.provider='SPORTMONKS' AND m.provider_player_id=u.provider_player_id::text AND u.capability='SCORERS' AND u.player_id IS NULL`);
   assert.equal(teams.rowCount,candidates.teams);assert.equal(players.rowCount,candidates.players);
  }
  report={status:'PASS',mode,candidates,providerRequests:0,fabricatedEntities:0,sourcePayloadsChanged:0,rollback:mode==='rehearse'};
  if(mode==='rehearse')throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 console.log(JSON.stringify(report));
}catch{console.error('Sports association check failed; private values withheld');process.exitCode=1;}finally{await db.close();}
