import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient,type QueryExecutor} from '../src/database/client';
import {SportsSitemapRepository} from '../src/sports/sitemap-repository';
const db=new PostgresDatabaseClient(databaseUrl()!,undefined,{statementTimeoutMs:60_000});
try{
  const indexes=(await db.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('players','team_squad_memberships','player_season_statistics','fixture_lineups','fixture_player_statistics')")).rows;
  let sql='',values:readonly unknown[]=[];
  const capture={query:async(text:string,args:readonly unknown[]=[])=>{sql=text;values=args;return {rows:[],rowCount:0};}} as unknown as QueryExecutor;
  await new SportsSitemapRepository(capture).entries('players',500,97*500);
  const start=Date.now();const plan=(await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,values)).rows[0]['QUERY PLAN'];
  await writeFile('output/hardening-sitemap-plan.json',JSON.stringify({at:new Date().toISOString(),indexes,plan},null,2));
  const walk=(p:Record<string,unknown>):unknown=>({node:p['Node Type'],table:p['Relation Name'],index:p['Index Name'],rows:p['Actual Rows'],loops:p['Actual Loops'],ms:p['Actual Total Time'],cost:p['Total Cost'],tempRead:p['Temp Read Blocks'],children:(p.Plans as Array<Record<string,unknown>>|undefined)?.map(walk)});
  console.log(JSON.stringify({ms:Date.now()-start,indexes:indexes.map(r=>r.indexname),plan:walk(plan[0].Plan),providerRequests:0},null,2));
}catch(error){console.error(JSON.stringify({code:error&&typeof error==='object'&&'code' in error?error.code:'SITEMAP_AUDIT_FAILED'}));process.exitCode=1;}finally{await db.close();}
