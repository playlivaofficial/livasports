import {geoProfile,type CoreGeo} from '@/config/geo';
import {rankGrowthInventory} from '@/growth/service';
import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {GrowthFixture} from '@/growth/types';
import {slugifyProfileName} from '@/profiles/routes';
import {matchPath} from '@/localization/interface';
import {siteOrigin} from '@/seo/policy';
import {gscWindows} from '@/seo/gsc-ingest';
import {gscProperty} from '@/seo/gsc';
import {collapse,type SearchRow} from '@/seo/intelligence';
import {SEO_AUTOPILOT as config} from './config';
import {seoOpportunityScore,type OpportunityEvidence} from './policy';

export async function acquireSeoRun(db:DatabaseClient,now:Date){
  return db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('seo-autopilot-v2'))");
    const active=await tx.query("SELECT id FROM seo_autopilot_runs WHERE state='RUNNING' AND lease_until>$1",[now]);
    if(active.rows.length)return null;
    await tx.query("UPDATE seo_autopilot_runs SET state='INTERRUPTED',finished_at=$1 WHERE state='RUNNING' AND lease_until<=$1",[now]);
    return String((await tx.query(`INSERT INTO seo_autopilot_runs(day,state,lease_until,config_version,release_sha)
      VALUES($1,'RUNNING',$2,$3,$4) RETURNING id`,[now.toISOString().slice(0,10),new Date(now.getTime()+600_000),config.version,process.env.VERCEL_GIT_COMMIT_SHA??null])).rows[0].id);
  });
}
export async function readSeoInventory(db:DatabaseClient,now:Date,geo:CoreGeo='MX'){
  const locale=geoProfile(geo).locale;
  const ranked=await rankGrowthInventory(db,now,geo);
  const rankedById=new Map(ranked.map(r=>[r.signals.fixtureId,r]));
  const inventory=(await db.query(`SELECT f.*,c.slug AS competition_slug,c.display_name_es_mx AS competition_name,c.competition_type,
    s.name AS stored_season,ht.public_id AS home_public_id,ht.name AS home_name,ht.image_url AS home_image,
    at.public_id AS away_public_id,at.name AS away_name,at.image_url AS away_image,
    (SELECT sc.position FROM standings_current sc WHERE sc.season_id=f.season_id AND sc.team_id=f.home_team_id ORDER BY sc.observed_at DESC LIMIT 1) AS home_position,
    (SELECT sc.position FROM standings_current sc WHERE sc.season_id=f.season_id AND sc.team_id=f.away_team_id ORDER BY sc.observed_at DESC LIMIT 1) AS away_position,
    (SELECT count(DISTINCT team_id)::int FROM standings_current sc WHERE sc.season_id=f.season_id) AS total_teams
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id LEFT JOIN seasons s ON s.id=f.season_id
    JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE c.enabled AND NOT ht.provider_placeholder AND NOT at.provider_placeholder
    AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)
    AND ((f.id=ANY($6::uuid[]) AND f.kickoff BETWEEN $1 AND $2 AND f.status='SCHEDULED') OR EXISTS(SELECT 1 FROM seo_geo_pages ap WHERE ap.fixture_id=f.id AND ap.locale=$4 AND ap.published_at IS NOT NULL)
      OR (c.slug=ANY($7::text[]) AND f.kickoff>$1::timestamptz-interval '30 days' AND EXISTS(SELECT 1 FROM seo_search_daily d WHERE d.property=$3 AND d.dimension='PAGE'
        AND d.key LIKE $5 AND right(d.key,16)=f.public_id AND d.day>=$1::date-28 AND d.impressions>=10 AND d.position BETWEEN 8 AND 20)))
    ORDER BY CASE WHEN f.kickoff>=$1 THEN 0 ELSE 1 END,f.kickoff,f.public_id LIMIT 500`,[now,new Date(now.getTime()+7*86_400_000),gscProperty(),locale,`${siteOrigin}/${locale}/partido/%`,ranked.map(r=>r.signals.fixtureId),config.enabledCompetitions])).rows;
  const fixtures:GrowthFixture[]=inventory.map(r=>{const home=String(r.home_name),away=String(r.away_name),id=String(r.public_id),path=matchPath(locale,id,home,away);
    return {signals:{fixtureId:String(r.id),publicId:id,kickoff:new Date(String(r.kickoff)).toISOString(),status:String(r.status),
      competitionSlug:String(r.competition_slug),competitionName:String(r.competition_name),competitionType:String(r.competition_type),seasonName:r.stored_season?String(r.stored_season):null,
      home:{name:home,slug:slugifyProfileName(home),publicId:String(r.home_public_id),imageUrl:r.home_image?String(r.home_image):null},
      away:{name:away,slug:slugifyProfileName(away),publicId:String(r.away_public_id),imageUrl:r.away_image?String(r.away_image):null},
      stageName:r.stage_name?String(r.stage_name):null,roundName:r.round_name?String(r.round_name):null,venue:r.venue_name?String(r.venue_name):null,
      standings:Number(r.total_teams)>0?{homePosition:r.home_position==null?null:Number(r.home_position),awayPosition:r.away_position==null?null:Number(r.away_position),totalTeams:Number(r.total_teams)}:null,oddsBookmakers:0},
      destinationPath:path,destinationUrl:siteOrigin+path,odds:{count:0,bookmakers:[],label:'Not used by SEO scoring'}};});
  const w=gscWindows(now);
  const [details,search,weights]=await Promise.all([
    db.query(`SELECT f.id,f.updated_at,f.home_team_id,f.away_team_id,f.home_score,f.away_score,
      EXISTS(SELECT 1 FROM growth_geo_priorities gp WHERE gp.fixture_id=f.id AND gp.geo=$3 AND gp.active) AS shortlisted,
      (SELECT jsonb_agg(row_to_json(v)) FROM (SELECT p.public_id,p.kickoff,p.home_score,p.away_score FROM fixtures p
        WHERE p.status='FINISHED' AND p.home_score IS NOT NULL AND p.away_score IS NOT NULL AND p.kickoff<f.kickoff
        AND (p.home_team_id IN(f.home_team_id,f.away_team_id) OR p.away_team_id IN(f.home_team_id,f.away_team_id)) ORDER BY p.kickoff DESC LIMIT 10) v) AS results,
      ap.state AS previous_state,ap.reasons AS previous_reasons,ap.content_hash AS previous_hash,ap.published_at,ap.title AS previous_title,ap.description AS previous_description,ap.checked_at,ap.retain_indexable,
      EXISTS(SELECT 1 FROM seo_metadata_experiments ex WHERE right(ex.page,16)=f.public_id AND ex.locale=$2) AS has_experiment
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      LEFT JOIN seo_geo_pages ap ON ap.fixture_id=f.id AND ap.locale=$2 WHERE f.id=ANY($1::uuid[])`,[fixtures.map(f=>f.signals.fixtureId),locale,geo]),
    db.query(`SELECT key,clicks,impressions,ctr,position FROM seo_search_daily WHERE property=$1 AND dimension='PAGE' AND day BETWEEN $2 AND $3`,[gscProperty(),w.current28.from,w.current28.to]),
    db.query("SELECT cluster,boost FROM seo_geo_clusters WHERE locale=$1 AND updated_at>now()-interval '14 days'",[locale]),
  ]);
  const pages=collapse(search.rows.map(r=>({key:String(r.key),clicks:Number(r.clicks),impressions:Number(r.impressions),ctr:Number(r.ctr),position:Number(r.position)} as SearchRow)));
  // Resource ordering only: approved scoring and publishing thresholds are not changed.
  const learning=await db.query("SELECT cluster,adjustment FROM seo_geo_cluster_weights WHERE locale=$1 AND updated_at>now()-interval '14 days'",[locale]).catch(()=>({rows:[]}));
  return fixtures.map(stored=>{
    const shared=rankedById.get(stored.signals.fixtureId),f=shared??stored;
    const row=details.rows.find(r=>r.id===f.signals.fixtureId)!,p=pages.find(p=>p.key===f.destinationUrl);
    const related=pages.filter(p=>p.key.startsWith(`${siteOrigin}/${locale}/`)&&[f.signals.home.publicId,f.signals.away.publicId].some(id=>p.key.endsWith(id)));
    const evidence:OpportunityEvidence={geo,priority:shared?.priority,impressions:p?.impressions??0,clicks:p?.clicks??0,queryImpressions:0,
      relatedImpressions:related.reduce((s,p)=>s+p.impressions,0),uniqueSignals:['fixture',...(f.signals.venue?['venue']:[]),
        ...(Array.isArray(row.results)&&row.results.length>=3?['recent-results']:[]),...(f.signals.standings?['standings']:[])],
      fresh:f.signals.status==='FINISHED'||now.getTime()-new Date(String(row.updated_at)).getTime()<7*86_400_000,shortlisted:row.shortlisted===true,inboundSources:0,
      clusterBoost:Number(weights.rows.find(r=>r.cluster===f.signals.competitionSlug)?.boost??0)};
    return {...f,geo,locale,row,evidence,resourceAdjustment:Number(learning.rows.find(w=>w.cluster===f.signals.competitionSlug)?.adjustment??0),score:seoOpportunityScore(f.signals,evidence,now)};
  }).sort((a,b)=>b.score.total-a.score.total||a.signals.publicId.localeCompare(b.signals.publicId));
}
export type SeoCandidate=Awaited<ReturnType<typeof readSeoInventory>>[number];
export async function recordSeoDecision(db:QueryExecutor,runId:string,url:string,action:string,reason:string,previous:unknown,next:unknown,signals:unknown){
  await db.query(`INSERT INTO seo_autopilot_decisions(run_id,url,action,reason,previous_state,new_state,signals,config_version,release_sha)
    VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9) ON CONFLICT(run_id,url,action) DO NOTHING`,
    [runId,url,action,reason,JSON.stringify(previous),JSON.stringify(next),JSON.stringify(signals),config.version,process.env.VERCEL_GIT_COMMIT_SHA??null]);
}
