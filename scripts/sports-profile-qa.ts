import assert from 'node:assert/strict';
import {PostgresDatabaseClient,databaseUrl,type DatabaseClient} from '../src/database/client';
import {PostgresProfileRepository} from '../src/profiles/repository';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{await db.transaction(async tx=>{
 await tx.query('SET TRANSACTION READ ONLY');
 const player=(await tx.query(`SELECT p.public_id,u.player_id,u.season_id,u.team_id,(u.payload->>'total')::numeric AS goals FROM sports_unlinked_competition_records u JOIN players p ON p.id=u.player_id WHERE u.capability='SCORERS' AND (u.payload->>'type_id')::int=208 LIMIT 1`)).rows[0];assert.ok(player);
 let pending:Promise<unknown>=Promise.resolve();
 const nested:DatabaseClient={query:(text,values)=>{const next=pending.then(()=>tx.query(text,values));pending=next;return next as ReturnType<DatabaseClient['query']>;},transaction:async f=>f(tx),close:async()=>{}};
 const p=await new PostgresProfileRepository(nested).player(player.public_id,'br');assert.ok(p);assert.equal(p.providerRequests,0);
 const stats=p.statistics.data.filter(r=>r.seasonId===player.season_id&&r.code==='GOALS');assert.ok(stats.some(r=>Number(r.value)===Number(player.goals)));
 assert.ok(stats.some(r=>r.teamId===player.team_id));
 console.log(JSON.stringify({status:'PASS',providerRequests:0,databaseReadOnly:true,sourceGoalsPreserved:true,teamAssociationHonest:true}));
});}catch{console.error('Profile fallback QA failed; private values withheld');process.exitCode=1;}finally{await db.close();}
