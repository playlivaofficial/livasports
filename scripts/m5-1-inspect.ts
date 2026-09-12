import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';

const db=new PostgresDatabaseClient(databaseUrl()!);
try {
  const counts=(await db.query(`SELECT (SELECT count(*) FROM competitions WHERE enabled) AS competitions,
    (SELECT count(*) FROM fixtures) AS fixtures,(SELECT count(*) FROM odds_current) AS quotes,
    (SELECT count(*) FROM odds_history) AS history,(SELECT count(*) FROM odds_provider_requests) AS odds_requests,
    (SELECT count(*) FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE') AS odds_mappings,
    (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING' AND lease_expires_at>now()) AS active_jobs,
    (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING' AND lease_expires_at<=now()) AS stale_jobs,
    (SELECT count(*) FROM odds_sync_snapshots WHERE applied_at IS NULL) AS pending_snapshots,
    (SELECT count(*) FROM affiliate_links WHERE enabled AND destination_url IS NOT NULL) AS configured_affiliate_links`)).rows[0];
  const upcoming=(await db.query(`SELECT c.slug,count(*) AS upcoming,
    count(*) FILTER(WHERE f.kickoff>now()+interval '48 hours') AS beyond48h,
    count(*) FILTER(WHERE f.kickoff<=now()+interval '48 hours' AND f.kickoff>now()+interval '12 hours') AS within48h,
    count(*) FILTER(WHERE f.kickoff<=now()+interval '12 hours' AND f.kickoff>now()+interval '2 hours') AS within12h,
    count(*) FILTER(WHERE f.kickoff<=now()+interval '2 hours' AND f.kickoff>now()+interval '15 minutes') AS within2h,
    count(*) FILTER(WHERE f.kickoff<=now()+interval '15 minutes') AS final15m,min(f.kickoff) AS nearest
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id AND c.enabled
    WHERE f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<now()+interval '45 days'
    GROUP BY c.slug ORDER BY c.slug`)).rows;
  const feeds=(await db.query(`SELECT b.provider_slug,c.slug,count(DISTINCT f.id) AS upcoming_with_retained_quotes,
    max(o.last_successful_refresh_at) AS last_refresh,array_agg(DISTINCT o.source_domain) AS domains
    FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id JOIN fixtures f ON f.id=o.fixture_id
    JOIN competitions c ON c.id=f.competition_id WHERE f.status='SCHEDULED' AND f.kickoff>now() GROUP BY 1,2 ORDER BY 1,2`)).rows;
  const geo=(await db.query(`SELECT b.provider_slug,c.iso2,g.odds_enabled,g.comparison_enabled,g.affiliate_enabled,
    b.affiliate_status,g.verified_at,g.evidence FROM bookmakers b JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id
    JOIN countries c ON c.id=g.country_id ORDER BY 1,2`)).rows;
  const budget=(await db.query(`SELECT b.*,(SELECT count(*) FROM odds_provider_requests r WHERE r.started_at>=b.period_start AND r.started_at<b.period_end) AS local_requests
    FROM odds_budget_baselines b ORDER BY period_start DESC LIMIT 2`)).rows;
  const result={at:new Date().toISOString(),counts,upcoming,feeds,geo,budget};
  await writeFile('output/m5-1-inspect-private.json',JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}catch{console.error('M5_1_INSPECTION_FAILED');process.exitCode=1;}finally{await db.close();}
