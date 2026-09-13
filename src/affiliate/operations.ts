import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {readCampaigns} from './repository';
import {signingKey} from './tokens';
import {POSTBACK_OPERATIONAL} from './conversions';
import {campaignDestination} from './policy';
export async function affiliateHealth(db:QueryExecutor){
  const campaigns=[...await readCampaigns(db,'br'),...await readCampaigns(db,'mx')];
  const metrics=(await db.query(`WITH i AS (SELECT campaign_id,placement_id,locale,geo,page_type,count(*) FILTER(WHERE traffic_class='HUMAN_VIEW') AS impressions,count(*) FILTER(WHERE traffic_class='QA_TEST') AS qa_impressions
    FROM affiliate_impressions WHERE occurred_at>now()-interval '30 days' GROUP BY 1,2,3,4,5),
    c AS (SELECT campaign_id,placement_id,locale,geo,page_type,count(*) FILTER(WHERE traffic_class='HUMAN_CLICK') AS clicks,count(*) FILTER(WHERE traffic_class='QA_TEST') AS qa_clicks,
      count(*) FILTER(WHERE traffic_class='HUMAN_CLICK' AND redirect_status='EMBED_ACTIVATION') AS embed_clicks,count(*) FILTER(WHERE traffic_class='QA_TEST' AND redirect_status='EMBED_ACTIVATION') AS qa_embed_clicks
    FROM affiliate_clicks WHERE campaign_id IS NOT NULL AND clicked_at>now()-interval '30 days' GROUP BY 1,2,3,4,5)
    SELECT coalesce(i.campaign_id,c.campaign_id) AS campaign_id,coalesce(i.placement_id,c.placement_id) AS placement,
    coalesce(i.locale,c.locale) AS locale,coalesce(i.geo,c.geo) AS geo,coalesce(i.page_type,c.page_type) AS page_type,
    coalesce(i.impressions,0) AS impressions,coalesce(c.clicks,0) AS clicks,coalesce(i.qa_impressions,0) AS qa_impressions,coalesce(c.qa_clicks,0) AS qa_clicks,
    coalesce(c.embed_clicks,0) AS embed_clicks,coalesce(c.qa_embed_clicks,0) AS qa_embed_clicks,
    CASE WHEN i.impressions>0 THEN coalesce(c.clicks,0)::numeric/i.impressions ELSE NULL END AS ctr
    FROM i FULL JOIN c USING(campaign_id,placement_id,locale,geo,page_type) ORDER BY campaign_id,placement LIMIT 500`)).rows;
  const operation=(await db.query('SELECT last_redirect_error_at,last_redirect_error,last_maintenance_at FROM affiliate_operational_state WHERE id=true')).rows[0];
  const conversions=(await db.query('SELECT count(*) AS received_events,max(received_at) AS last_received_at FROM affiliate_conversion_events')).rows[0];
  const productMetrics=(await db.query("SELECT event_name,locale,count(*) AS events FROM product_events WHERE event_name IN ('odds_module_view','slip_comparison_view') AND occurred_at>now()-interval '30 days' GROUP BY 1,2 ORDER BY 1,2")).rows;
  return {at:new Date().toISOString(),signingConfigured:!!signingKey(),analyticsMode:process.env.AFFILIATE_ANALYTICS_MODE??'anonymous',
    campaigns:campaigns.map(c=>({id:c.id,bookmaker:c.bookmaker,locale:c.locale,enabled:c.enabled,approved:c.approved,geoEligible:c.geoEligible,affiliateApproved:c.affiliateApproved,
      campaignEligibleNow:!!campaignDestination(c,{locale:c.locale,pagePath:"/"+c.locale,placement:c.placements[0],bookmaker:c.bookmaker},Date.now()),destinationConfigured:!!c.destination,destinationType:c.destinationType,placements:c.placements,validFrom:c.startsAt,validUntil:c.endsAt,approvedCreativeCount:c.creatives.filter(c=>c.approved&&c.enabled).length})),
    metrics,operation,existingProductEvents:{trafficClassification:'LEGACY_UNCLASSIFIED_INCLUDES_QA',pageViewMeasurement:'NOT_CONFIGURED',metrics:productMetrics},postbackOperational:POSTBACK_OPERATIONAL,subIdPropagationOperational:false,conversionMeasurement:'OPERATOR_EVIDENCE_ONLY_NO_RECEIVER',conversions,
    redirectEvidence:'ISSUED_303 proves a LivaSports redirect; EMBED_ACTIVATION proves an observed publisher-embed activation. Neither proves operator arrival. Embed counts are subsets, never added to total clicks.',retentionDays:{impressions:30,clicks:90,operatorEvents:395},providerRequests:0};
}
export async function pruneAffiliateAnalytics(db:QueryExecutor){
  // Bounded batches. Repeat explicitly until drained; no background scheduler is claimed.
  const impressions=await db.query(`DELETE FROM affiliate_impressions WHERE id IN (SELECT id FROM affiliate_impressions WHERE occurred_at<now()-interval '30 days' ORDER BY occurred_at LIMIT 5000)`);
  const clicks=await db.query(`DELETE FROM affiliate_clicks WHERE id IN (SELECT id FROM affiliate_clicks WHERE campaign_id IS NOT NULL AND clicked_at<now()-interval '90 days' ORDER BY clicked_at LIMIT 5000)`);
  const conversions=await db.query(`DELETE FROM affiliate_conversion_events WHERE id IN (SELECT id FROM affiliate_conversion_events WHERE received_at<now()-interval '395 days' ORDER BY received_at LIMIT 5000)`);
  await db.query('UPDATE affiliate_operational_state SET last_maintenance_at=now() WHERE id=true');
  return {impressions:impressions.rowCount,clicks:clicks.rowCount,operatorEvents:conversions.rowCount};
}
