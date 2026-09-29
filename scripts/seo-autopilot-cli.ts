/** Scoped release/audit runner. No providers, secret output, env export or user data access. */
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readSeoInventory} from '../src/seo-autopilot/repository';
import {crawlSeoUrl} from '../src/seo-autopilot/crawl';
import {seoInternalLinkEngine} from '../src/seo-autopilot/policy';
import {runMigrations} from '../src/database/migrate';
import {readAutopilotReport} from '../src/seo-autopilot/report';
const args=process.argv.slice(2),mode=args[0],envAt=args.indexOf('--db-env');
const env=envAt>=0?parseEnv(await readFile(args[envAt+1],'utf8')):process.env;
const url=databaseUrl({DATABASE_URL:env.DATABASE_URL??env.DATABASE_POSTGRES_URL??env.POSTGRES_URL});
if(!url)throw Error('DATABASE_NOT_CONFIGURED');
const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:25_000});
try{
  if(mode==='plan'){
    let result:unknown;
    try{await db.transaction(async tx=>{
      const sql=await readFile(new URL('../db/migrations/051_seo_autopilot.sql',import.meta.url),'utf8');
      await tx.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
      const inventory=await readSeoInventory(tx,new Date());
      result={migrationSyntax:'PASS_ROLLED_BACK',considered:inventory.length,shortlist:inventory.slice(0,15).map(c=>({url:c.destinationUrl,kickoff:c.signals.kickoff,status:c.signals.status,score:c.score.total,tier:c.score.tier,evidence:c.evidence,links:seoInternalLinkEngine(c.signals)})),providerRequests:0};
      throw Error('EXPECTED_ROLLBACK');
    });}catch(error){if(!(error instanceof Error)||error.message!=='EXPECTED_ROLLBACK')throw error;}
    if(args.includes('--crawl')){
      const selected=(result as {shortlist:Array<{url:string;links:Array<{href:string}>}>}).shortlist.slice(0,3),audits=[];
      for(const c of selected){const html=await crawlSeoUrl(c.url),sources=await Promise.all(c.links.map(l=>crawlSeoUrl('https://livasports.com'+l.href)));
        audits.push({url:c.url,problems:html.problems,canonical:html.canonical,inbound:sources.map(s=>({url:s.url,status:s.status,linksTarget:s.links.includes(c.url)}))});}
      console.log(JSON.stringify({audits,providerRequests:0}));
    }else console.log(JSON.stringify(result));
  }else if(mode==='migrate'){
    const pending=(await db.query('SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1')).rows[0]?.filename;
    if(pending!=='050_social_platform_compliance.sql'&&pending!=='051_seo_autopilot.sql')throw Error('UNEXPECTED_MIGRATION_BASELINE');
    console.log(JSON.stringify({applied:await runMigrations(db),idempotent:await runMigrations(db)}));
  }else if(mode==='audit'){
    const candidates=await readSeoInventory(db,new Date()),pages=[];
    for(const c of candidates.slice(0,3)){
      const html=await crawlSeoUrl(c.destinationUrl),sources=await Promise.all(seoInternalLinkEngine(c.signals).map(l=>crawlSeoUrl('https://livasports.com'+l.href)));
      pages.push({url:c.destinationUrl,score:c.score.total,problems:html.problems,inbound:sources.map(s=>({url:s.url,status:s.status,linksTarget:s.links.includes(c.destinationUrl)}))});
    }
    console.log(JSON.stringify({pages,providerRequests:0}));
  }else if(mode==='report'){
    const r=await readAutopilotReport(db);console.log(JSON.stringify(r));
  }else throw Error('MODE_NOT_ALLOWED');
}catch(error){console.error(JSON.stringify({error:'SEO_CLI_FAILED',code:(error as {code?:string}).code??null}));process.exitCode=1;}
finally{await db.close();}
