import {CORE_GEOS,geoProfile} from '@/config/geo';
import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscWindows} from '@/seo/gsc-ingest';
import {gscProperty} from '@/seo/gsc';
import {SEO_AUTOPILOT as config} from './config';
import {feedbackDecision} from './policy';
import {recordSeoDecision} from './repository';

/** Once per ISO week, absolute bounded boosts (not compounding) with old/new values for reversal. */
export async function optimizeSeoClusters(db:QueryExecutor,runId:string,now:Date){
  const monday=new Date(now);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));const week=monday.toISOString().slice(0,10);
  const w=gscWindows(now);
  const observed=Number((await db.query(`SELECT count(DISTINCT day)::int AS days FROM seo_search_daily WHERE property=$1 AND dimension='TOTAL' AND day BETWEEN $2 AND $3`,[gscProperty(),w.current28.from,w.current28.to])).rows[0]?.days??0);
  if(observed>=28){
    const aged=(await db.query(`SELECT p.fixture_id,p.url,p.score,p.published_at,c.slug,
      COALESCE((SELECT sum(d.impressions) FROM seo_search_daily d WHERE d.property=$1 AND d.dimension='PAGE' AND d.key=p.url AND d.day BETWEEN $2 AND $3),0)::int AS impressions,
      COALESCE((SELECT sum(d.clicks) FROM seo_search_daily d WHERE d.property=$1 AND d.dimension='PAGE' AND d.key=p.url),0)::int AS historical_clicks
      FROM seo_geo_pages p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
      WHERE p.locale IN('mx','co','pe') AND p.state='PUBLISHED' AND p.published_at<$4::timestamptz-interval '90 days' ORDER BY p.published_at LIMIT 5`,[gscProperty(),w.current28.from,w.current28.to,now])).rows;
    for(const p of aged){
      if(Number(p.impressions)>0)continue;
      const strategic=Number(p.historical_clicks)>0||Number(p.score)>=config.tierBThreshold;
      if(!strategic)await db.query("UPDATE seo_geo_pages SET state='PRODUCT_ONLY',retain_indexable=false,reasons='[\"90_DAY_LOW_VALUE_REVIEW\"]'::jsonb WHERE url=$1",[p.url]);
      await recordSeoDecision(db,runId,String(p.url),strategic?'RETAIN_STRATEGIC':'EXCLUDE_FROM_SITEMAP',
        'At least 90 days since promotion and 28 complete GSC days. Product URL/data retained; no deletion or speculative redirect.',
        {state:'PUBLISHED'},{state:strategic?'PUBLISHED':'PRODUCT_ONLY'},p);
    }
  }
  const rows=(await db.query(`SELECT c.slug,split_part(d.key,'/',4) AS locale,
    CASE WHEN d.day>=$3::date THEN 'current' ELSE 'previous' END AS period,
    sum(d.clicks)::int AS clicks,sum(d.impressions)::int AS impressions,
    sum(d.position*d.impressions)/NULLIF(sum(d.impressions),0) AS position,count(DISTINCT d.day)::int AS days
    FROM seo_search_daily d JOIN fixtures f ON right(d.key,16)=f.public_id JOIN competitions c ON c.id=f.competition_id
    WHERE d.property=$1 AND d.dimension='PAGE' AND d.key ~ '^https://livasports[.]com/(mx|co|pe)/partido/'
    AND d.day BETWEEN $2::date AND $4::date GROUP BY c.slug,locale,period`,[gscProperty(),w.previous7.from,w.current7.from,w.current7.to])).rows;
  let changed=0;
  for(const geo of CORE_GEOS)for(const slug of config.enabledCompetitions){
    const locale=geoProfile(geo).locale;
    const old=(await db.query('SELECT boost,evaluated_week::text AS evaluated_week FROM seo_geo_clusters WHERE cluster=$1 AND locale=$2',[slug,locale])).rows[0];
    if(old&&String(old.evaluated_week)===week)continue;
    const metrics=(period:string)=>{const r=rows.find(r=>r.slug===slug&&r.locale===locale&&r.period===period);return {clicks:Number(r?.clicks??0),impressions:Number(r?.impressions??0),position:Number(r?.position??0),days:Number(r?.days??0)};};
    const current=metrics('current'),previous=metrics('previous'),decision=feedbackDecision(current,previous,0,true);
    // Insufficient observations never masquerade as evidence for a winner.
    await db.query(`INSERT INTO seo_geo_clusters(cluster,boost,evidence,evaluated_week,locale) VALUES($1,$2,$3::jsonb,$4,$5)
      ON CONFLICT(locale,cluster) DO UPDATE SET boost=$2,evidence=$3::jsonb,evaluated_week=$4,updated_at=now()`,[slug,decision.boost,JSON.stringify({geo,current,previous,...decision}),week,locale]);
    if(Number(old?.boost??0)!==decision.boost){changed++;await recordSeoDecision(db,runId,`cluster:${locale}:${slug}`,'WEEKLY_BOOST',decision.actions.join(',')||'Insufficient sustained growth: boost reset',old??null,{boost:decision.boost},{current,previous});}
  }
  return {week,changed};
}
