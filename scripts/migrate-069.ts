// Controlled single-transaction apply of migration 069, per docs/GEO_MIGRATION_RELEASE.md: one outer
// transaction holding the schema advisory lock, bounded lock/statement/idle timeouts, the migration
// body and its ledger row committed together. Any error rolls the whole unit back.
// DATABASE_URL is read from the environment only and is never printed.
import {readFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';

const filename='069_mx_winpot_co_bwin_commercial.sql';
const url=databaseUrl();if(!url)throw Error('DATABASE_URL_MISSING');
const raw=await readFile(new URL('../db/migrations/'+filename,import.meta.url),'utf8');
const body=raw.replace(/^\s*BEGIN;\s*$/m,'').replace(/^\s*COMMIT;\s*$/m,'');
if(/^\s*(BEGIN|COMMIT);\s*$/m.test(body))throw Error('UNEXPECTED_TRANSACTION_CONTROL');
const db=new PostgresDatabaseClient(url);
const peSnapshot=`SELECT b.provider_slug,g.odds_enabled,g.comparison_enabled,g.affiliate_enabled,g.commercial_status,g.commercial_version,g.destination_domains,g.legal_reference
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id WHERE c.iso2='PE' ORDER BY b.provider_slug`;
const peCreatives=`SELECT s.id,s.enabled,s.placement,s.delivery_type FROM profile_sponsor_campaigns s WHERE s.locale='pe' ORDER BY s.id`;
try{
  const result=await db.transaction(async tx=>{
    await tx.query("SET LOCAL lock_timeout='2s'");
    await tx.query("SET LOCAL statement_timeout='15s'");
    await tx.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports-schema-migration'))");
    const last=(await tx.query('SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1')).rows[0]?.filename;
    if((await tx.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[filename])).rowCount)return {status:'ALREADY_APPLIED',last};
    if(last!=='068_pe_1xbet_affiliate_host.sql')throw Error('UNEXPECTED_LEDGER_HEAD '+last);
    const peBefore=JSON.stringify([(await tx.query(peSnapshot)).rows,(await tx.query(peCreatives)).rows]);
    await tx.query(body);
    await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);
    const peAfter=JSON.stringify([(await tx.query(peSnapshot)).rows,(await tx.query(peCreatives)).rows]);
    if(peBefore!==peAfter)throw Error('PERU_CHANGED_ROLLED_BACK');
    const mx=(await tx.query(`SELECT b.provider_slug,g.odds_enabled,g.affiliate_enabled,g.commercial_status,m.provider_bookmaker_id FROM bookmaker_geo_availability g
      JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
      LEFT JOIN operator_provider_mappings m ON m.bookmaker_id=b.id AND m.country_id=c.id AND m.verified_at IS NOT NULL
      WHERE c.iso2='MX' AND g.odds_enabled ORDER BY 1`)).rows;
    const rightRail=(await tx.query(`SELECT s.locale,count(*) FILTER (WHERE s.enabled) AS enabled,count(*) AS total FROM profile_sponsor_campaigns s
      WHERE s.placement IN ('home_right_rail','match_right_rail') AND s.locale IN ('mx','co') GROUP BY 1 ORDER BY 1`)).rows;
    return {status:'APPLIED',previousHead:last,peUnchanged:true,mxOddsPool:mx,mxCoRightRail:rightRail};
  });
  console.log(JSON.stringify(result,null,1));
}finally{await db.close();}
