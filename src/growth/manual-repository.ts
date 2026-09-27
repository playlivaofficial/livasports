import 'server-only';
import {createHash} from 'node:crypto';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {GrowthVideoChannel} from './config';
import {readGrowthItem} from './repository';
import {currentAssetReady,postSnapshot,publicationIdentity,validExternalPostUrl,type ManualPost,type PublishingOverview,type PostingReceipt} from './manual-publishing';

export interface MarkPostedInput {itemId:string;channel:GrowthVideoChannel;sha256:string;creativeVersion:string;externalPostUrl?:string;notes?:string;}
export async function isLatestGrowthItem(db:QueryExecutor,itemId:string):Promise<boolean>{
  const result=await db.query(`SELECT i.id FROM growth_content_items i WHERE i.id=$1 AND i.superseded_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM growth_content_items newer WHERE newer.fixture_id=i.fixture_id AND newer.superseded_at IS NULL
      AND (newer.created_at,newer.id)>(i.created_at,i.id))`,[itemId]);
  return !!result.rows.length;
}
export async function markGrowthPosted(db:DatabaseClient,input:MarkPostedInput,sessionId:string,now=new Date()):Promise<{id:string;postedAt:string}> {
  const external=validExternalPostUrl(input.externalPostUrl);
  if(input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>500))throw new Error('INVALID_POST_NOTE');
  return db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('growth:'||fixture_id::text,0)) FROM growth_content_items WHERE id=$1",[input.itemId]);
    await tx.query('SELECT channel FROM growth_content_channels WHERE content_item_id=$1 ORDER BY channel FOR UPDATE',[input.itemId]);
    const item=await readGrowthItem(tx,input.itemId);
    const asset=item?.platformAssets?.find(a=>a.channel===input.channel),record=item?.channels.find(c=>c.channel===input.channel);
    if(!item||!asset||!record||!currentAssetReady(item,input.channel)||!(await isLatestGrowthItem(tx,input.itemId))
      ||asset.sha256!==input.sha256||item.creativeVersion!==input.creativeVersion)throw new Error('STALE_OR_UNREADY_ASSET');
    if(record.status==='PUBLISHED')throw new Error('ALREADY_POSTED');
    if(!['DRAFT','APPROVED'].includes(record.status))throw new Error('POSTING_NOT_ALLOWED');
    const identity=publicationIdentity(item,input.channel),snapshot=postSnapshot(item,input.channel);
    const inserted=await tx.query<{id:string}>(`INSERT INTO growth_manual_posts(content_item_id,fixture_id,channel,content_identity,creative_version,
      asset_sha256,generated_at,posted_at,posted_by,external_post_url,notes,snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
    [item.id,item.fixtureId,input.channel,identity,item.creativeVersion,asset.sha256,asset.generatedAt,now,
      createHash('sha256').update(`manual-post-owner:${sessionId}`).digest('hex'),external,input.notes?.trim()||null,JSON.stringify(snapshot)]);
    if(!inserted.rows[0])throw new Error('ALREADY_POSTED');
    await tx.query(`UPDATE growth_content_channels SET status='PUBLISHED',approved_at=COALESCE(approved_at,$3),published_at=$3,updated_at=$3
      WHERE content_item_id=$1 AND channel=$2`,[item.id,input.channel,now]);
    return {id:inserted.rows[0].id,postedAt:now.toISOString()};
  });
}

export interface PublishingFilters {channel?:string;fixture?:string;version?:string;date?:string;offset?:number;}
/** Duplicate status must not disappear just because its receipt moved beyond the first history page. */
export async function readCurrentPostingReceipts(db:QueryExecutor,fixtureIds:string[]):Promise<PostingReceipt[]>{
  if(!fixtureIds.length)return [];
  const rows=(await db.query(`SELECT p.* FROM growth_manual_posts p WHERE p.fixture_id=ANY($1::uuid[]) AND EXISTS(
    SELECT 1 FROM growth_content_items i JOIN growth_platform_assets a ON a.content_item_id=i.id
    WHERE i.fixture_id=p.fixture_id AND i.superseded_at IS NULL AND i.creative_version=p.creative_version
      AND a.channel=p.channel AND a.sha256=p.asset_sha256)`,[fixtureIds])).rows;
  return rows.map(row=>({id:row.id,itemId:row.content_item_id,channel:row.channel,fixtureId:row.fixture_id,creativeVersion:row.creative_version,
    contentIdentity:row.content_identity,assetSha256:row.asset_sha256,generatedAt:new Date(row.generated_at).toISOString(),postedAt:new Date(row.posted_at).toISOString(),
    postedBy:row.posted_by,externalPostUrl:row.external_post_url,notes:row.notes,snapshot:row.snapshot}));
}
/** Paginated, owner-only ledger. Events stay in the existing first-party analytics tables. */
export async function readPublishingOverview(db:QueryExecutor,filters:PublishingFilters={}):Promise<PublishingOverview>{
  const params:unknown[]=[filters.channel||null,filters.fixture||null,filters.version||null,filters.date||null];
  const where=`($1::text IS NULL OR p.channel=$1) AND ($2::text IS NULL OR i.fixture_snapshot->'home'->>'name' ILIKE '%'||$2||'%' OR i.fixture_snapshot->'away'->>'name' ILIKE '%'||$2||'%')
    AND ($3::text IS NULL OR p.creative_version=$3) AND ($4::date IS NULL OR (p.posted_at AT TIME ZONE 'America/Sao_Paulo')::date=$4::date)`;
  const [counts,rows]=await Promise.all([
    db.query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE (p.posted_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS today,
      count(*) FILTER(WHERE p.posted_at>=now()-interval '7 days')::int AS last7,
      count(*) FILTER(WHERE p.channel='TIKTOK')::int AS tiktok,count(*) FILTER(WHERE p.channel='INSTAGRAM_REELS')::int AS instagram,
      count(*) FILTER(WHERE p.channel='YOUTUBE_SHORTS')::int AS youtube FROM growth_manual_posts p JOIN growth_content_items i ON i.id=p.content_item_id WHERE ${where}`,params),
    db.query(`WITH page AS (SELECT p.*,i.fixture_snapshot,i.revision,i.superseded_at,
      EXISTS(SELECT 1 FROM growth_content_items newer WHERE newer.fixture_id=i.fixture_id AND (newer.created_at,newer.id)>(i.created_at,i.id)) AS newer_exists
      FROM growth_manual_posts p JOIN growth_content_items i ON i.id=p.content_item_id WHERE ${where}
      ORDER BY p.posted_at DESC,p.id DESC LIMIT 50 OFFSET $5)
      SELECT page.*,m.* FROM page LEFT JOIN LATERAL (
        SELECT count(DISTINCT s.session_id)::int AS sessions,count(e.id) FILTER(WHERE e.event_name='match_viewed')::int AS match_views,
          count(e.id) FILTER(WHERE e.event_name='odds_selected')::int AS odds,count(e.id) FILTER(WHERE e.event_name='slip_leg_added')::int AS slip_adds,
          count(e.id) FILTER(WHERE e.event_name='outbound_redirect_completed')::int AS clicks
        FROM analytics_sessions s LEFT JOIN analytics_events e ON e.session_id=s.session_id AND e.traffic_class='HUMAN'
        WHERE s.traffic_class='HUMAN' AND s.utm_source=page.snapshot->>'utmSource' AND s.utm_campaign=page.snapshot->>'utmCampaign'
          AND s.utm_content=page.snapshot->>'utmContent'
      ) m ON true ORDER BY page.posted_at DESC,page.id DESC`,[...params,filters.offset??0])
  ]);
  const count=counts.rows[0]??{};
  const posts=rows.rows.map((row):ManualPost=>({id:row.id,itemId:row.content_item_id,channel:row.channel,fixtureId:row.fixture_id,
    fixtureLabel:`${row.fixture_snapshot.home.name} vs ${row.fixture_snapshot.away.name}`,revision:Number(row.revision),creativeVersion:row.creative_version,
    contentIdentity:row.content_identity,assetSha256:row.asset_sha256,generatedAt:new Date(row.generated_at).toISOString(),postedAt:new Date(row.posted_at).toISOString(),
    postedBy:row.posted_by,externalPostUrl:row.external_post_url,notes:row.notes,snapshot:row.snapshot,superseded:!!row.superseded_at||row.newer_exists,
    metrics:{sessions:Number(row.sessions),matchViews:Number(row.match_views),odds:Number(row.odds),slipAdds:Number(row.slip_adds),clicks:Number(row.clicks)}}));
  return {posts,total:Number(count.total??0),today:Number(count.today??0),last7Days:Number(count.last7??0),byPlatform:{TIKTOK:Number(count.tiktok??0),INSTAGRAM_REELS:Number(count.instagram??0),YOUTUBE_SHORTS:Number(count.youtube??0)}};
}
