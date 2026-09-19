/** Explicit, bounded release operations. No implicit sync or provider discovery. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {runTargetedRefresh} from '../src/odds/reliability/recovery';
import {consumeRequestLimit} from '../src/security/request-limit';
import {runMigrations} from '../src/database/migrate';

const command=process.argv[2];
if(!['migrate','migrate-indexes','audit-limiter','recover-mls'].includes(command??''))throw new Error('EXPLICIT_OPERATION_REQUIRED');
const url=databaseUrl();if(!url)throw new Error('DATABASE_NOT_CONFIGURED');
const db=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:command==='migrate-indexes'?600_000:60_000});
try{
  if(command==='migrate'){
    const filename='027_launch_request_limits.sql';
    const sql=(await readFile(`db/migrations/${filename}`,'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
    const applied=await db.transaction(async tx=>{
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports:migrations'))");
      const rows=(await tx.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows;
      if(rows.some(r=>r.filename===filename))return false;
      if(rows.length!==26||rows.at(-1)?.filename!=='026_p4_product_analytics.sql')throw new Error('MIGRATION_BASELINE_MISMATCH');
      await tx.query("SET LOCAL lock_timeout='5s'");await tx.query("SET LOCAL statement_timeout='30s'");
      await tx.query(sql);await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);return true;
    });
    console.log(JSON.stringify({operation:command,migration:filename,applied,providerRequests:0}));
  }else if(command==='migrate-indexes'){
    if(!(await db.query("SELECT 1 FROM schema_migrations WHERE filename='027_launch_request_limits.sql'")).rowCount)throw new Error('MIGRATION_BASELINE_MISMATCH');
    console.log(JSON.stringify({operation:command,applied:await runMigrations(db),providerRequests:0}));
  }else if(command==='audit-limiter'){
    const marker=new Error('ROLLBACK_QA');let result:unknown;
    try{await db.transaction(async tx=>{
      const bucket=randomBytes(32).toString('hex');const first=await consumeRequestLimit(tx,bucket,2),second=await consumeRequestLimit(tx,bucket,2),third=await consumeRequestLimit(tx,bucket,2);
      result={operation:command,firstAllowed:first===null,secondAllowed:second===null,thirdBlocked:typeof third==='number',rolledBack:true,providerRequests:0};
      if(first!==null||second!==null||third===null)throw new Error('RATE_LIMIT_AUDIT_FAILED');throw marker;
    });}catch(e){if(e!==marker)throw e;}
    console.log(JSON.stringify(result));
  }else{
    const key=process.env.ODDSPAPI_API_KEY?.trim();if(!key)throw new Error('PROVIDER_NOT_CONFIGURED');
    const result=await runTargetedRefresh(db,key,'mls',{trigger:'OWNER',reason:'Final launch hardening: verify bounded recovery of expired MLS quotes'});
    await writeFile('output/hardening-mls-recovery.json',JSON.stringify({at:new Date().toISOString(),...result},null,2));
    console.log(JSON.stringify(result));
  }
}catch(error){console.error(JSON.stringify({operation:command,error:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'OPERATION_FAILED'}));process.exitCode=1;}
finally{await db.close();}
