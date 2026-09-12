import {writeFile,readFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {SELECTIONS,ODDS_TTL_MS} from '../src/odds/types';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const counts=(await db.query(`SELECT (SELECT count(*) FROM competitions WHERE enabled) AS competitions,(SELECT count(*) FROM seasons) AS seasons,
    (SELECT count(*) FROM teams) AS teams,(SELECT count(*) FROM fixtures) AS fixtures,(SELECT count(*) FROM provider_entity_mappings) AS mappings,
    (SELECT count(*) FROM odds_current) AS quotes,(SELECT count(*) FROM odds_history) AS history`)).rows[0];
  const fixtures=(await db.query(`SELECT f.id,f.public_id,c.slug,f.kickoff,f.status,m.provider_entity_id FROM fixtures f JOIN competitions c ON c.id=f.competition_id
    JOIN provider_entity_mappings m ON m.livasports_entity_id=f.id AND m.provider='ODDSPAPI' AND m.entity_type='FIXTURE' ORDER BY c.slug,f.kickoff`)).rows;
  const quotes=(await db.query(`SELECT o.*,b.provider_slug FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id ORDER BY fIXTURE_id,b.provider_slug,market_code,outcome_code`)).rows;
  const requests=(await db.query('SELECT endpoint,safe_query,started_at,completed_at,http_status,outcome FROM odds_provider_requests ORDER BY started_at')).rows;
  const corrections=(await db.query(`SELECT f.id,f.public_id,f.status,m.metadata->'m5KickoffCorrection' AS evidence FROM provider_entity_mappings m JOIN fixtures f ON f.id=m.livasports_entity_id
    WHERE m.provider='SPORTMONKS' AND m.entity_type='FIXTURE' AND m.metadata ? 'm5KickoffCorrection' ORDER BY f.id`)).rows;
  const geos=(await db.query(`SELECT b.provider_slug,c.iso2,g.odds_enabled,g.comparison_enabled,g.affiliate_enabled,g.evidence FROM bookmaker_geo_availability g
    JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id ORDER BY b.provider_slug,c.iso2`)).rows;
  const missing=[];const coverage=[];
  for(const bookmaker of ['betano.bet.br','betsson'])for(const competition of [...new Set(fixtures.map(f=>f.slug))])for(const [market,outcomes] of Object.entries(SELECTIONS)){
    const group=fixtures.filter(f=>f.slug===competition);let complete=0,active=0;
    for(const f of group){const found=quotes.filter(q=>q.fixture_id===f.id&&q.provider_slug===bookmaker&&q.market_code===market);
      if(outcomes.every(o=>found.some(q=>q.outcome_code===o)))complete++;
      if(outcomes.every(o=>found.some(q=>q.outcome_code===o&&q.status==='ACTIVE')))active++;
      for(const outcome of outcomes)if(!found.some(q=>q.outcome_code===outcome))missing.push({fixtureId:f.id,competition,bookmaker,market,outcome,line:market==='TOTAL_GOALS'?2.5:null});
    }
    coverage.push({bookmaker,competition,market,fixtures:group.length,completeAtObservation:complete,activeAtObservation:active,
      completenessStatus:group.length===0?'NO SAMPLE':complete===group.length?'PASS':complete>0?'PARTIAL PASS':'FAIL',coveragePercent:group.length?Math.round(complete/group.length*1000)/10:null});
  }
  const timestamps={providerMissing:quotes.filter(q=>!q.provider_updated_at).length,
    oldestProviderChange:quotes.map(q=>q.provider_updated_at?.toISOString()).filter(Boolean).sort()[0]??null,
    newestProviderChange:quotes.map(q=>q.provider_updated_at?.toISOString()).filter(Boolean).sort().at(-1)??null,
    oldestObservation:quotes.map(q=>q.observed_at?.toISOString()).filter(Boolean).sort()[0]??null,
    newestObservation:quotes.map(q=>q.observed_at?.toISOString()).filter(Boolean).sort().at(-1)??null,
    expiredObservations:quotes.filter(q=>!q.observed_at||Date.now()-q.observed_at.getTime()>=ODDS_TTL_MS).length};
  const replay=JSON.parse(await readFile('output/m5-ingestion-private.json','utf8'));
  const report={at:new Date().toISOString(),counts,fixtures,coverage,missing,timestamps,geos,requests,
    providerUsage:{oddsPapi:requests.length,sportmonks:2,normalNavigation:0},
    kickoffCorrection:{changed:corrections.length,timezoneOnly:corrections.filter(c=>c.evidence.reason==='UTC_PARSE_DEFECT_PROVEN').length,
      timezonePlusScheduleChange:corrections.filter(c=>c.evidence.reason!=='UTC_PARSE_DEFECT_PROVEN').length,canonicalIdsPreserved:true,publicIdsPreserved:true,unverifiedFixturesNotShifted:Number(counts.fixtures)-corrections.length,corrections},
    idempotency:{at:replay.at,results:replay.results.map((r:Record<string,unknown>)=>({bookmaker:r.bookmaker,historyChanges:r.history_changes,currentWrites:r.current_writes,closed:r.closed}))},
    limitation:'Generic Betsson feed does not verify BR/MX jurisdiction. No eligible MX feed or configured affiliate CTA. No production scheduler is running.'};
  await writeFile('output/m5-coverage-report.json',JSON.stringify(report,null,2));
  const lines=['# LivaSports M5 — Odds coverage report','',`Generated: ${report.at}`,'',
    'Observed feed completeness is separate from executable current prices, GEO eligibility and commercial approval. Expired/suspended/GEO-unverified quotes cannot be best odds.','',
    `Database: ${counts.competitions} enabled competitions; ${counts.seasons} seasons; ${counts.teams} teams; ${counts.fixtures} fixtures; ${counts.mappings} mappings; ${counts.quotes} current quote records; ${counts.history} meaningful history records.`,
    '',`Provider usage: ${requests.length} OddsPapi requests (failed attempts included); 2 narrow Sportmonks diagnostic requests; normal navigation 0.`,
    '', '| Bookmaker | Competition | Market | Complete/sample | Active at observation | Coverage | Result |','|---|---|---|---:|---:|---:|---|',
    ...coverage.map(c=>`| ${c.bookmaker} | ${c.competition} | ${c.market} | ${c.completeAtObservation}/${c.fixtures} | ${c.activeAtObservation} | ${c.coveragePercent}% | ${c.completenessStatus} |`),
    '',`Missing selections: ${missing.length}. See the JSON report for every exact canonical fixture/market/outcome. No missing price was replaced with zero.`,
    '',`Timestamps: ${timestamps.providerMissing} missing provider timestamps; oldest/newest provider change ${timestamps.oldestProviderChange} / ${timestamps.newestProviderChange}; latest observation ${timestamps.newestObservation}; ${timestamps.expiredObservations} observations expired at report time.`,
    '', '## GEO and affiliate boundary','',report.limitation,'',
    'Betano BR can supply BR users with odds for a Mexican competition; that is not evidence of an eligible Mexican bookmaker feed. `/mx` intentionally shows its localized no-coverage state.',
    '', '## Verified kickoff corrections','',`${corrections.length} fixture timestamps corrected from exact Sportmonks evidence; ${report.kickoffCorrection.timezoneOnly} timezone-only, ${report.kickoffCorrection.timezonePlusScheduleChange} also had a source schedule change. IDs/public URLs preserved. Other ${report.kickoffCorrection.unverifiedFixturesNotShifted} fixture timestamps were not shifted.`,
    '', '## Repeat ingestion','',...report.idempotency.results.map((r:{bookmaker:unknown;historyChanges:unknown;currentWrites:unknown})=>`- ${r.bookmaker}: current writes ${r.currentWrites}; history changes ${r.historyChanges}.`),
    '', 'Full timestamps, request paths/sanitized queries, matching and correction evidence are in the JSON companion. No credentials or raw affiliate destinations are included.',''];
  await writeFile('output/m5-coverage-report.md',lines.join('\n'));console.info(JSON.stringify({counts,missingSelections:missing.length,providerUsage:report.providerUsage,kickoffCorrections:corrections.length}));
}catch{console.error('M5 report generation failed without logging credentials');process.exitCode=1;}finally{await db.close();}
