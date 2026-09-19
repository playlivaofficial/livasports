import type {QueryExecutor} from './client';
/** Deliberately limited to plain additive CREATE INDEX statements, not a general SQL script parser. */
export async function concurrentIndexMigration(db:QueryExecutor,sql:string):Promise<void>{
  const statements=sql.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
  if(!statements.length||statements.some(s=>!/^CREATE INDEX CONCURRENTLY IF NOT EXISTS [a-z_]+ ON [a-z_]+\([a-z_,\s]+\)(?: WHERE [a-z_]+ IS NOT NULL)?$/i.test(s)))throw new Error('INVALID_CONCURRENT_INDEX_MIGRATION');
  for(const statement of statements){
    const name=/IF NOT EXISTS ([a-z_]+)/i.exec(statement)![1];
    const before=await db.query('SELECT indisvalid,indisready FROM pg_index WHERE indexrelid=to_regclass($1)',[name]);
    if(before.rows[0]&&(!before.rows[0].indisvalid||!before.rows[0].indisready))throw new Error('INVALID_INDEX_REQUIRES_OPERATOR_REVIEW');
    await db.query(statement);
    const after=await db.query('SELECT indisvalid,indisready FROM pg_index WHERE indexrelid=to_regclass($1)',[name]);
    if(!after.rows[0]?.indisvalid||!after.rows[0]?.indisready)throw new Error('INDEX_BUILD_NOT_VALID');
  }
}
