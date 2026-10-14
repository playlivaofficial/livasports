import 'server-only';
import type {QueryExecutor} from '@/database/client';
import type {CoreGeo} from '@/config/geo';
import {gscProperty} from '@/seo/gsc';
import {gscWindows} from '@/seo/gsc-ingest';
import {buildCountryDemand,growthCountryCode,type CountrySearchRow} from './country-demand';

/** Two bounded reads of existing ingestion. Includes all locales; only actual searcher country selects rows. */
export async function readCountryDemand(db:QueryExecutor,geo:CoreGeo,now:Date){
 const desired=gscWindows(now).current28,property=gscProperty();
 // A local-midnight rotation can precede Google's 05:40 UTC ingestion. Reuse the latest complete
 // cached 28-day country report, with its actual dates, instead of discarding yesterday's evidence.
 const sync=(await db.query(`SELECT captured_at,from_day::text,to_day::text FROM seo_breakdown_syncs WHERE property=$1 AND dimension='COUNTRY' AND state='SUCCEEDED'
  AND to_day<=$2::date AND from_day<=to_day-27 AND captured_at<=$3 ORDER BY to_day DESC,captured_at DESC LIMIT 1`,[property,desired.to,now])).rows[0];
 const to=sync?.to_day?String(sync.to_day):desired.to,from=new Date(Date.parse(to)-27*86400000).toISOString().slice(0,10);
 const rows=await db.query(`WITH pages AS (
    SELECT day::text,page,impressions,clicks,
     substring(page from '/(?:jogo|partido|match)/[^/?]+-([a-f0-9]{16})(?:[?].*)?$') AS fixture_public_id,
     substring(page from '/(?:time|equipo|team)/[^/?]+-([a-f0-9]{16})(?:[?].*)?$') AS team_public_id,
     CASE WHEN page ~ '^https://livasports[.]com/(mx|co|pe|br|en)/(futbol|futebol|football)[?]' THEN substring(page from '[?&]competition=([^&]+)') END AS competition_slug
    FROM seo_page_breakdowns WHERE property=$1 AND dimension='COUNTRY' AND lower(key)=$2 AND day BETWEEN $3::date AND $4::date
   ) SELECT p.day,p.page,p.impressions,p.clicks,coalesce(c.slug,hc.slug) AS competition,ht.public_id AS home_public_id,at.public_id AS away_public_id,t.public_id AS team_public_id
   FROM pages p LEFT JOIN fixtures f ON f.public_id=p.fixture_public_id LEFT JOIN competitions c ON c.id=f.competition_id
   LEFT JOIN competitions hc ON hc.slug=p.competition_slug LEFT JOIN teams ht ON ht.id=f.home_team_id LEFT JOIN teams at ON at.id=f.away_team_id
   LEFT JOIN teams t ON t.public_id=p.team_public_id`,[property,growthCountryCode(geo),from,to]);
 return buildCountryDemand(geo,rows.rows.map(r=>({day:String(r.day),page:String(r.page),impressions:Number(r.impressions),clicks:Number(r.clicks),competition:r.competition?String(r.competition):null,
  homePublicId:r.home_public_id?String(r.home_public_id):null,awayPublicId:r.away_public_id?String(r.away_public_id):null,teamPublicId:r.team_public_id?String(r.team_public_id):null})) as CountrySearchRow[],
  {from,to,capturedAt:sync?.captured_at?(sync.captured_at instanceof Date?sync.captured_at.toISOString():new Date(String(sync.captured_at)).toISOString()):null},now);
}
