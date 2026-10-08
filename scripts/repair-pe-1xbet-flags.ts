import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {startOddsJob,endOddsJob,persistSnapshot} from '../src/odds/ingestion';
import {repairSavedPeruOneXBetFlags} from '../src/odds/saved-flag-repair';
import type {OddsSnapshot} from '../src/odds/types';

// Dry-run by default. Uses the worker lease, canonical matcher and ordinary GEO persistence.
// No provider requests, timestamp promotion, price invention or eligibility override.
const db=new PostgresDatabaseClient(databaseUrl()!,undefined,{statementTimeoutMs:30000});
let job:string|null=null;
try{
  const rows=(await db.query(`SELECT DISTINCT ON (bookmaker,tid) s.id,s.payload FROM odds_sync_snapshots s
    CROSS JOIN LATERAL jsonb_array_elements_text(payload->'tournamentIds') tid
    WHERE bookmaker='1xbet' AND applied_at IS NOT NULL AND observed_at>now()-interval '7 days'
    ORDER BY bookmaker,tid,observed_at DESC`)).rows;
  const unique=[...new Map(rows.map(r=>[r.id,r])).values()];
  const repairs=unique.map(row=>({id:row.id,...repairSavedPeruOneXBetFlags(row.payload as OddsSnapshot)})).filter(r=>r.repaired);
  const apply=process.argv.includes('--apply');
  if(apply&&repairs.length)job=await startOddsJob(db);
  const results=[];
  for(const repair of repairs){
    const saved=job?await persistSnapshot(db,job,repair.snapshot):null;
    results.push({snapshotId:repair.id,observedAt:repair.snapshot.observedAt,tournaments:repair.snapshot.tournamentIds,reclassified:repair.repaired,...(saved?{saved}: {})});
  }
  if(job){await db.query(`INSERT INTO odds_recovery_actions(trigger_source,action,bookmaker,reason,request_cost,outcome,detail)
    VALUES('OWNER','PE_1XBET_FLAG_REPAIR','1xbet','Verified active markets and individual prices; original observations retained',0,'REPLAYED',$1::jsonb)`,[JSON.stringify(results)]);await endOddsJob(db,job,true);job=null;}
  console.log(JSON.stringify({apply,providerRequests:0,results}));
}finally{if(job)await endOddsJob(db,job,false);await db.close();}
