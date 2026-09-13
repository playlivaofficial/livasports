import {readFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const filename='015_odds_quote_freshness.sql';
  await db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports-schema-migration'))");
    if((await tx.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[filename])).rowCount){console.log('Already applied: '+filename);return;}
    await tx.query(await readFile(new URL('../db/migrations/'+filename,import.meta.url),'utf8'));
    await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);
    console.log('Applied additive migration: '+filename);
  });
}finally{await db.close();}
