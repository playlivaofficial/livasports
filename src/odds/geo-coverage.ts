import type {QueryExecutor} from '@/database/client';
import {APPROVED_COMPETITION_TARGETS,isAcquisitionCompetition} from '@/config/footballCompetitions';
import {CORE_GEOS,type CoreGeo} from '@/config/geo';
import {COVERAGE_WINDOWS,COVERAGE_WINDOW_HOURS,emptyCounts,type CompetitionCoverageInput,type CoverageWindowCounts} from './coverage-health';
import {readVerifiedOperatorFeeds} from './operator-feeds';
import {currentQuoteSql} from './current-quote-sql';

export interface GeoCoverageInput extends CompetitionCoverageInput {geo:CoreGeo;canonicalCompetition:string;operatorFeeds:string[];nativeCounts:Record<string,number>;}
const iso=(v:unknown)=>v instanceof Date?v.toISOString():typeof v==='string'?v:null;
/** Same exact-GEO source/mapping/freshness boundaries as public reads. Never borrow BR quotes or proxy coverage. */
const coverageCtes=`WITH eligible AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS e(geo text,"operatorId" text,"providerBookmakerId" text,"sourceDomains" jsonb)),
    fx AS (SELECT f.id,f.competition_id,f.home_team_id,f.away_team_id,f.kickoff,f.status,c.slug,
        (SELECT min(provider_entity_id) FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='COMPETITION' AND livasports_entity_id=c.id) AS tournament_id
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id WHERE c.enabled AND c.slug=ANY($2::text[])
        AND f.status='SCHEDULED' AND f.kickoff>$3 AND f.kickoff<=$3::timestamptz+interval '14 days'
        AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)),
    quotes AS (SELECT o.*,e.geo AS verified_geo,
        (${currentQuoteSql('$3::timestamptz')}) AS current_quote
      FROM odds_geo_current o JOIN fx f ON f.id=o.fixture_id JOIN bookmakers b ON b.id=o.bookmaker_id
      JOIN eligible e ON e.geo=o.geo AND e."operatorId"=b.provider_slug AND e."providerBookmakerId"=o.provider_bookmaker_id
      JOIN provider_entity_mappings fm ON fm.provider=o.source_provider AND fm.entity_type='FIXTURE' AND fm.provider_entity_id=o.provider_fixture_id AND fm.livasports_entity_id=f.id
      JOIN provider_entity_mappings hm ON hm.provider=o.source_provider AND hm.entity_type='TEAM' AND hm.provider_entity_id=fm.metadata->>'homeProviderId' AND hm.livasports_entity_id=f.home_team_id
      JOIN provider_entity_mappings am ON am.provider=o.source_provider AND am.entity_type='TEAM' AND am.provider_entity_id=fm.metadata->>'awayProviderId' AND am.livasports_entity_id=f.away_team_id
      JOIN odds_mapping_reviews mr ON mr.provider_fixture_id=o.provider_fixture_id AND mr.fixture_id=f.id AND mr.state IN ('EXACT','HIGH_CONFIDENCE')
      JOIN provider_entity_mappings cm ON cm.provider=o.source_provider AND cm.entity_type='COMPETITION'
        AND cm.provider_entity_id=COALESCE(mr.evidence->>'providerCompetitionId',fm.metadata->>'providerCompetitionId') AND cm.livasports_entity_id=f.competition_id
      WHERE o.source_provider='ODDSPAPI' AND o.mapping_verified AND o.phase='PREGAME' AND o.scope='FULL_TIME_REGULATION'
        AND abs(extract(epoch FROM((fm.metadata->>'canonicalKickoff')::timestamptz-f.kickoff)))<=600
        AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(e."sourceDomains") d(host)
          WHERE regexp_replace(lower(d.host),'^www\\.','')=regexp_replace(lower(o.source_domain),'^www\\.',''))) `;
const approved=APPROVED_COMPETITION_TARGETS.filter(c=>isAcquisitionCompetition(c.slug));
export async function readGeoQuoteAges(db:QueryExecutor,now=new Date()){
  const feeds=await readVerifiedOperatorFeeds(db);
  return db.query(`${coverageCtes} SELECT q.geo||':'||f.slug AS competition,
    percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM($3::timestamptz-q.observed_at))/60) FILTER(WHERE q.current_quote) AS p50,
    percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM($3::timestamptz-q.observed_at))/60) FILTER(WHERE q.current_quote) AS p95,
    max(extract(epoch FROM($3::timestamptz-q.observed_at))/60) FILTER(WHERE q.current_quote) AS oldest,
    count(*) FILTER(WHERE q.current_quote)::int AS current_quotes,
    count(*) FILTER(WHERE q.current_quote AND extract(epoch FROM($3::timestamptz-q.observed_at))/60>=q.freshness_ttl_minutes*.85)::int AS stale_quotes,
    count(*) FILTER(WHERE q.status='ACTIVE' AND NOT q.current_quote)::int AS expired_quotes
    FROM quotes q JOIN fx f ON f.id=q.fixture_id WHERE f.kickoff<=$3::timestamptz+interval '7 days' GROUP BY q.geo,f.slug`,
    [JSON.stringify(feeds),approved.map(c=>c.slug),now.toISOString()]);
}
export async function readGeoCoverageInputs(db:QueryExecutor,now=new Date()):Promise<GeoCoverageInput[]>{
  const feeds=await readVerifiedOperatorFeeds(db);
  const rows=(await db.query(`${coverageCtes}, per_book AS (SELECT geo,fixture_id,provider_bookmaker_id,count(*) FILTER(WHERE current_quote)::int AS current_count,
      count(DISTINCT outcome_code) FILTER(WHERE current_quote AND market_code='MATCH_WINNER' AND line IS NULL AND outcome_code IN ('HOME','DRAW','AWAY'))=3 AS mw,
      count(DISTINCT outcome_code) FILTER(WHERE current_quote AND market_code='TOTAL_GOALS' AND line=2.5 AND outcome_code IN ('OVER','UNDER'))=2 AS ou,
      count(DISTINCT outcome_code) FILTER(WHERE current_quote AND market_code='BTTS' AND outcome_code IN ('YES','NO'))=2 AS btts,
      count(*)::int AS stored_count,bool_and(status='CLOSED') AS closed_only
      FROM quotes GROUP BY geo,fixture_id,provider_bookmaker_id)
    SELECT g.geo,f.id,f.slug,f.kickoff,f.tournament_id,p.provider_bookmaker_id,p.current_count,p.mw,p.ou,p.btts,p.stored_count,p.closed_only,
      t.last_success_at,t.last_attempt_at,t.consecutive_failures,t.last_error
    FROM fx f CROSS JOIN unnest($4::text[]) g(geo) LEFT JOIN eligible e ON e.geo=g.geo
      LEFT JOIN per_book p ON p.geo=g.geo AND p.fixture_id=f.id AND p.provider_bookmaker_id=e."providerBookmakerId"
      LEFT JOIN odds_refresh_targets t ON t.bookmaker=e."providerBookmakerId" AND t.tournament_id=f.tournament_id
    ORDER BY g.geo,f.slug,f.kickoff,f.id`,[JSON.stringify(feeds),approved.map(c=>c.slug),now.toISOString(),CORE_GEOS])).rows;
  const result:GeoCoverageInput[]=[];
  for(const geo of CORE_GEOS)for(const definition of approved){
    const group=rows.filter(r=>r.geo===geo&&r.slug===definition.slug);
    const windows=Object.fromEntries(COVERAGE_WINDOWS.map(w=>[w,emptyCounts()])) as GeoCoverageInput['windows'];
    const nativeCounts:Record<string,number>={};
    for(const fixtureId of new Set(group.map(r=>r.id))){
      const fixture=group.filter(r=>r.id===fixtureId),hours=(new Date(fixture[0].kickoff).getTime()-+now)/3600000;
      const current=fixture.some(r=>Number(r.current_count)>0),stored=fixture.filter(r=>Number(r.stored_count)>0);
      const counts:CoverageWindowCounts={...emptyCounts(),fixtures:1,anyOdds:Number(current),matchWinner:Number(fixture.some(r=>r.mw)),
        totalGoals25:Number(fixture.some(r=>r.ou)),btts:Number(fixture.some(r=>r.btts)),neither:Number(!current),
        staleOnly:Number(!current&&stored.length>0),closedOnly:Number(!current&&stored.length>0&&stored.every(r=>r.closed_only))};
      for(const w of COVERAGE_WINDOWS)if(hours<=COVERAGE_WINDOW_HOURS[w])for(const k of Object.keys(counts) as (keyof CoverageWindowCounts)[])windows[w][k]+=counts[k];
      if(hours<=168)for(const row of fixture)if(row.provider_bookmaker_id)nativeCounts[row.provider_bookmaker_id]=(nativeCounts[row.provider_bookmaker_id]??0)+Number(row.current_count??0);
    }
    const latest=(field:string)=>group.map(r=>iso(r[field])).filter((v):v is string=>!!v).sort().at(-1)??null;
    result.push({geo,canonicalCompetition:definition.slug,competition:`${geo}:${definition.slug}`,operatorFeeds:feeds.filter(f=>f.geo===geo).map(f=>f.providerBookmakerId),nativeCounts,
      tournamentId:group[0]?.tournament_id??null,nearestKickoff:iso(group[0]?.kickoff),lastSuccessAt:latest('last_success_at'),lastAttemptAt:latest('last_attempt_at'),
      consecutiveFailures:Math.max(0,...group.map(r=>Number(r.consecutive_failures??0))),lastError:group.find(r=>r.last_error)?.last_error??null,windows});
  }
  return result;
}
