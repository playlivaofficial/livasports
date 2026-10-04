/** Real PostgreSQL migration regression with pre-existing legacy rows. No environment or provider access. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {DatabaseClient} from '../src/database/client';
import {readCommercialOperators} from '../src/affiliate/owner-commercial';

/** Uses only transaction-scoped temporary copies; never mutates the supplied database's permanent rows. */
export async function runGeoCandidateRepairAssertions(db:DatabaseClient){
  const sql=(await readFile(new URL('../db/migrations/062_geo_candidate_repair.sql',import.meta.url),'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
  return db.transaction(async q=>{
    await q.query("SET LOCAL statement_timeout='5s'");await q.query("SET LOCAL lock_timeout='1s'");
    // Reuse actual table shape/checks, but isolate every update from production-shaped fixture data.
    for(const table of ['bookmakers','countries','bookmaker_geo_availability'])await q.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
    await q.query('SET LOCAL search_path=pg_temp,public');
    await q.query("INSERT INTO countries(iso2,name) VALUES('MX','Mexico'),('CO','Colombia'),('PE','Peru'),('BR','Brazil')");
    await q.query(`INSERT INTO bookmakers(provider_slug,display_name,enabled,comparison_enabled,affiliate_status)
      VALUES('betsson','Betsson',true,true,'PENDING'),('betano.bet.br','Betano BR',true,true,'PENDING'),
      ('codere','Codere',true,false,'PENDING'),('caliente','Caliente',true,false,'PENDING'),('10bet','10Bet',true,false,'PENDING'),
      ('betano','Betano',true,false,'PENDING'),('future-operator','Future Operator',true,false,'PENDING')`);
    await q.query(`INSERT INTO bookmaker_geo_availability(bookmaker_id,country_id,commercial_status,currency,public_priority,commercial_version,
      odds_enabled,comparison_enabled,sportsbook_enabled,affiliate_enabled,legal_reference,source_domains)
      SELECT b.id,c.id,v.status,v.currency,v.priority,v.version,v.odds,v.odds,v.odds,false,'keep-evidence',ARRAY['keep-source.invalid']
      FROM (VALUES
        ('betsson','MX','CANDIDATE',NULL,100,0,false),
        ('betano.bet.br','MX','CANDIDATE',NULL,100,0,false),
        ('codere','MX','CANDIDATE','MXN',20,0,false),('caliente','MX','CANDIDATE','MXN',30,0,false),('10bet','MX','CANDIDATE','MXN',40,0,false),
        ('betsson','CO','CANDIDATE',NULL,100,3,true),
        ('codere','CO','CANDIDATE','USD',7,0,false),
        ('betsson','PE','PENDING','PEN',8,0,true),
        ('betano','CO','CANDIDATE','COP',30,0,false),('betano','PE','CANDIDATE','PEN',20,0,false),
        ('future-operator','CO','PENDING','COP',100,0,false),
        ('betano.bet.br','BR','SUSPENDED',NULL,100,0,true)
      ) AS v(operator,geo,status,currency,priority,version,odds)
      JOIN bookmakers b ON b.provider_slug=v.operator JOIN countries c ON c.iso2=v.geo`);
    const snapshot=async()=> (await q.query(`SELECT b.provider_slug AS operator,c.iso2 AS geo,to_jsonb(g) AS row
      FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
      ORDER BY b.provider_slug,c.iso2`)).rows;
    const before=await snapshot();await q.query(sql);const once=await snapshot();await q.query(sql);const twice=await snapshot();
    assert.deepEqual(twice,once,'062 must be idempotent including timestamps');
    const pick=(rows:typeof before,operator:string,geo:string)=>rows.find(r=>r.operator===operator&&r.geo===geo)!.row;
    const mx=pick(once,'betsson','MX');assert.equal(mx.currency,'MXN');assert.equal(mx.public_priority,10);assert.equal(mx.commercial_status,'CANDIDATE');
    const historical=pick(once,'betano.bet.br','MX');assert.equal(historical.commercial_status,'UNAVAILABLE');
    for(const [operator,geo] of [['betsson','CO'],['codere','CO'],['betsson','PE'],['betano','CO'],['betano','PE'],['future-operator','CO'],['betano.bet.br','BR']]){
      assert.deepEqual(pick(once,operator,geo),pick(before,operator,geo),`${operator}/${geo}: unrelated/customized/history row unchanged`);
    }
    for(const row of once){const original=pick(before,row.operator,row.geo);
      for(const key of ['odds_enabled','comparison_enabled','sportsbook_enabled','affiliate_enabled','legal_reference','source_domains','commercial_version'])assert.deepEqual(row.row[key],original[key],`${row.operator}/${row.geo}: ${key} preserved`);
    }
    const operators=await readCommercialOperators(q);
    assert.deepEqual(operators.filter(r=>r.geo==='MX').map(r=>r.operator),['betsson','codere','caliente','10bet']);
    assert.ok(operators.some(r=>r.operator==='future-operator'&&r.geo==='CO'),'future legitimate candidate is not hidden by a fixed allowlist');
    assert.ok(!operators.some(r=>r.operator==='betano.bet.br'),'historical BR-only identity is never a core candidate');
    return {checks:8,preExistingLegacyRows:true,idempotent:true,mxOperators:operators.filter(r=>r.geo==='MX').map(r=>r.operator),manualConfigurationPreserved:true,brHistoryPreserved:true,feedEligibilityPreserved:true,temporaryTablesOnly:true};
  });
}
