import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {absoluteUrl} from '@/seo/policy';
import {CREATIVE_VERSION} from './creative-version';
import {exposeMaster} from './master-model';
import type {CanonicalRender} from './canonical-renderer';
import type {GrowthCanonicalAsset,GrowthAssetKind} from './types';
import {matchPath} from '@/localization/interface';
import {slugifyProfileName} from '@/profiles/routes';
import {readListingOddsSnapshots} from '@/odds/read-repository';
import {quoteState} from '@/odds/comparison';
import {SHORTLIST,GROWTH_CHANNELS,type GrowthChannel} from './config';
import {publicBookmakerSummary} from './public-bookmakers';
import {playerEvidenceScore} from './strategy';
import type {FixtureSignals} from './scoring';
import type {GrowthVideoRenderResult} from './video-renderer';
import type {GrowthChannelRecord,GrowthChannelStatus,GrowthContentItem,GrowthContentPack,GrowthFixture,GrowthFixtureSnapshot,GrowthMediaRights,GrowthPlatformAsset,GrowthPlayerCandidate,GrowthSeoPriority,GrowthTeamForm,RankedGrowthFixture} from './types';

type Row=Record<string,unknown>;
const iso=(value:unknown)=>new Date(String(value)).toISOString();
const text=(value:unknown)=>value===null||value===undefined?null:String(value);
const numeric=(value:unknown)=>value===null||value===undefined?null:Number(value);
const asJson=<T>(value:unknown):T=>typeof value==='string'?JSON.parse(value) as T:value as T;

/** One bounded, DB-only candidate read; ordinary ranking never contacts a provider. */
export async function readGrowthFixtures(db:QueryExecutor,now=new Date()):Promise<GrowthFixture[]>{
  const from=new Date(now.getTime()-SHORTLIST.graceHours*3_600_000);
  const to=new Date(now.getTime()+SHORTLIST.horizonHours*3_600_000);
  const rows=(await db.query<Row>(`SELECT f.id AS fixture_id,f.public_id,f.kickoff,f.status,f.stage_name,f.round_name,f.venue_name,
    c.slug AS competition_slug,c.display_name_pt_br AS competition_name,c.competition_type,s.name AS season_name,
    ht.public_id AS home_public_id,ht.name AS home_name,ht.image_url AS home_image_url,
    at.public_id AS away_public_id,at.name AS away_name,at.image_url AS away_image_url,
    (SELECT sc.position FROM standings_current sc WHERE sc.season_id=f.season_id AND sc.team_id=f.home_team_id ORDER BY sc.observed_at DESC,sc.stage_id DESC LIMIT 1) AS home_position,
    (SELECT sc.position FROM standings_current sc WHERE sc.season_id=f.season_id AND sc.team_id=f.away_team_id ORDER BY sc.observed_at DESC,sc.stage_id DESC LIMIT 1) AS away_position,
    (SELECT count(DISTINCT sc.team_id)::int FROM standings_current sc WHERE sc.season_id=f.season_id) AS total_teams
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id
    LEFT JOIN seasons s ON s.id=f.season_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE c.enabled AND f.kickoff BETWEEN $1 AND $2
      AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)
    ORDER BY f.kickoff,f.public_id LIMIT 500`,[from,to])).rows;
  const fixtureIds=rows.map(row=>String(row.fixture_id));
  const snapshots=fixtureIds.length?await readListingOddsSnapshots(db,fixtureIds,'BR',true):new Map();
  return rows.map(row=>{
    const id=String(row.fixture_id),snapshot=snapshots.get(id);
    const active=new Map<string,string>();
    if(snapshot)for(const quote of snapshot.quotes){
      if(quote.geoEligible&&quoteState(quote,snapshot,now.getTime())==='ACTIVE')active.set(quote.bookmaker,quote.bookmakerName);
    }
    const count=active.size;
    const publicSummary=snapshot?publicBookmakerSummary(snapshot,now.getTime()):{bookmakers:[],priceGap:null};
    const standingsTotal=numeric(row.total_teams),homePosition=numeric(row.home_position),awayPosition=numeric(row.away_position);
    const standings=standingsTotal&&standingsTotal>0?{homePosition,awayPosition,totalTeams:standingsTotal}:null;
    const homeName=String(row.home_name),awayName=String(row.away_name),publicId=String(row.public_id);
    const signals:FixtureSignals={fixtureId:id,publicId,kickoff:iso(row.kickoff),status:String(row.status),
      competitionSlug:String(row.competition_slug),competitionName:String(row.competition_name),competitionType:String(row.competition_type),seasonName:text(row.season_name),
      home:{slug:slugifyProfileName(homeName),name:homeName,publicId:String(row.home_public_id),imageUrl:text(row.home_image_url)},
      away:{slug:slugifyProfileName(awayName),name:awayName,publicId:String(row.away_public_id),imageUrl:text(row.away_image_url)},
      stageName:text(row.stage_name),roundName:text(row.round_name),venue:text(row.venue_name),standings,oddsBookmakers:count};
    const destinationPath=matchPath('br',publicId,homeName,awayName);
    return {signals,destinationPath,destinationUrl:absoluteUrl(destinationPath),odds:{bookmakers:publicSummary.bookmakers,count,
      label:count?`${count} ${count===1?'casa com odds atuais':'casas com odds atuais'}`:'Sem odds atuais',
      publicBookmakers:publicSummary.bookmakers,publicPriceGap:publicSummary.priceGap}};
  });
}

function metric(value:unknown){
  if(value===null||value===undefined)return null;
  const candidate=typeof value==='object'&&(value as Record<string,unknown>).total!==undefined?(value as Record<string,unknown>).total:value;
  const number=Number(candidate);return Number.isFinite(number)&&number>=0?number:null;
}
function form(rows:Row[],side:'home'|'away'):GrowthTeamForm|null{
  const matches=rows.filter(row=>String(row.side)===side);if(!matches.length)return null;const teamId=String(matches[0].team_id);
  return matches.reduce<GrowthTeamForm>((summary,row)=>{const home=String(row.home_team_id)===teamId;
    const own=Number(home?row.home_score:row.away_score),other=Number(home?row.away_score:row.home_score);
    summary.played++;summary.goalsFor+=own;summary.goalsAgainst+=other;if(own>other)summary.wins++;else if(own===other)summary.draws++;else summary.losses++;return summary;
  },{played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0});
}
function media(row:Row):GrowthMediaRights{
  const stored=String(row.license_status??'UNKNOWN') as GrowthMediaRights['licenseStatus'],now=Date.now(),from=row.valid_from?Date.parse(String(row.valid_from)):null,until=row.valid_until?Date.parse(String(row.valid_until)):null;
  const inWindow=(from===null||from<=now)&&(until===null||until>now),status:GrowthMediaRights['licenseStatus']=stored==='APPROVED'&&!inWindow?'EXPIRED':stored;
  const eligible=status==='APPROVED'&&inWindow&&row.commercial_eligible===true&&!!row.asset_url;
  return {source:text(row.media_source),licenseStatus:status,commercialEligible:eligible,assetUrl:eligible?text(row.asset_url):null,
    evidence:row.media_evidence?JSON.stringify(asJson(row.media_evidence)):null};
}

/** Adds only persisted, current-season player/form evidence. Missing rights always means no portrait. */
export async function enrichGrowthStorySignals(db:QueryExecutor,fixtures:RankedGrowthFixture[]):Promise<RankedGrowthFixture[]>{
  if(!fixtures.length)return fixtures;
  const ids=fixtures.map(row=>row.signals.fixtureId);
  const playerRows=(await db.query<Row>(`WITH targets AS (
      SELECT f.id AS fixture_id,f.season_id,f.home_team_id,f.away_team_id FROM fixtures f WHERE f.id=ANY($1::uuid[])
    ), player_metrics AS (
      SELECT ps.player_id,ps.team_id,ps.season_id,jsonb_object_agg(st.developer_name,ps.value) FILTER(WHERE st.developer_name IS NOT NULL) AS metrics
      FROM player_season_statistics ps JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=ps.provider_type_id
      WHERE st.developer_name IN ('GOALS','ASSISTS','APPEARANCES','STARTS','LINEUPS','MINUTES_PLAYED') GROUP BY ps.player_id,ps.team_id,ps.season_id
    ) SELECT t.fixture_id,CASE WHEN sm.team_id=t.home_team_id THEN 'home' ELSE 'away' END AS side,sm.team_id,tm.name AS team_name,
      p.id,p.public_id,p.display_name,COALESCE(pm.metrics,'{}'::jsonb) AS metrics,
      rights.source AS media_source,rights.asset_url,rights.license_status,rights.commercial_eligible,rights.evidence AS media_evidence,rights.valid_from,rights.valid_until
    FROM targets t JOIN team_squad_memberships sm ON sm.season_id=t.season_id AND sm.team_id IN(t.home_team_id,t.away_team_id)
    JOIN teams tm ON tm.id=sm.team_id JOIN players p ON p.id=sm.player_id
    LEFT JOIN player_metrics pm ON pm.player_id=sm.player_id AND pm.team_id=sm.team_id AND pm.season_id=sm.season_id
    LEFT JOIN LATERAL (SELECT mr.* FROM growth_media_rights mr WHERE mr.player_id=p.id
      ORDER BY (mr.license_status='APPROVED' AND mr.commercial_eligible AND (mr.valid_from IS NULL OR mr.valid_from<=now()) AND (mr.valid_until IS NULL OR mr.valid_until>now())) DESC,mr.updated_at DESC LIMIT 1) rights ON true
    WHERE (sm.starts_at IS NULL OR sm.starts_at<=current_date) AND (sm.ends_at IS NULL OR sm.ends_at>=current_date)
    ORDER BY t.fixture_id,side,p.display_name`,[ids])).rows;
  const formRows=(await db.query<Row>(`WITH target_teams AS (
      SELECT f.id AS fixture_id,f.kickoff,f.home_team_id AS team_id,'home'::text AS side FROM fixtures f WHERE f.id=ANY($1::uuid[])
      UNION ALL SELECT f.id,f.kickoff,f.away_team_id,'away'::text FROM fixtures f WHERE f.id=ANY($1::uuid[])
    ) SELECT tt.fixture_id,tt.team_id,tt.side,recent.home_team_id,recent.away_team_id,recent.home_score,recent.away_score
    FROM target_teams tt CROSS JOIN LATERAL (SELECT f.home_team_id,f.away_team_id,f.home_score,f.away_score FROM fixtures f
      WHERE f.status='FINISHED' AND f.kickoff<tt.kickoff AND (f.home_team_id=tt.team_id OR f.away_team_id=tt.team_id)
        AND f.home_score IS NOT NULL AND f.away_score IS NOT NULL ORDER BY f.kickoff DESC,f.id LIMIT 5) recent`,[ids])).rows;
  const playerGroups=new Map<string,{home:GrowthPlayerCandidate[];away:GrowthPlayerCandidate[]}>();
  for(const row of playerRows){
    const values=asJson<Record<string,unknown>>(row.metrics??{});const statistics={appearances:metric(values.APPEARANCES),starts:metric(values.STARTS??values.LINEUPS),minutes:metric(values.MINUTES_PLAYED),goals:metric(values.GOALS),assists:metric(values.ASSISTS)};
    const goals=statistics.goals??0,assists=statistics.assists??0,starts=statistics.starts??0,appearances=statistics.appearances??0;
    const reason=goals>0?`${goals} gols registrados na temporada`:assists>0?`${assists} assistências registradas na temporada`:starts>0?`${starts} titularidades registradas na temporada`:`${appearances} aparições registradas na temporada`;
    const candidate:GrowthPlayerCandidate={id:String(row.id),publicId:String(row.public_id),teamId:String(row.team_id),teamName:String(row.team_name),name:String(row.display_name),statistics,
      evidenceScore:playerEvidenceScore(statistics),selectionReason:reason,media:media(row)};
    const key=String(row.fixture_id),group=playerGroups.get(key)??{home:[],away:[]};group[String(row.side)==='home'?'home':'away'].push(candidate);playerGroups.set(key,group);
  }
  for(const group of playerGroups.values())for(const side of [group.home,group.away]){
    const maxGoals=Math.max(0,...side.map(candidate=>candidate.statistics.goals??0));
    if(maxGoals>0)for(const candidate of side.filter(item=>item.statistics.goals===maxGoals))candidate.selectionReason=`artilheiro atual do elenco nos dados da temporada (${maxGoals} gols)`;
  }
  const teamIds=[...new Set(fixtures.flatMap(row=>[row.signals.home.publicId,row.signals.away.publicId]))];
  const history=(await db.query<{fixture_snapshot:GrowthFixtureSnapshot;content_pack:GrowthContentPack}>(`SELECT fixture_snapshot,content_pack FROM growth_content_items
    WHERE created_at>=now()-interval '14 days' AND (fixture_snapshot#>>'{home,publicId}'=ANY($1::text[]) OR fixture_snapshot#>>'{away,publicId}'=ANY($1::text[]))
    ORDER BY created_at DESC,id DESC LIMIT 60`,[teamIds])).rows;
  return fixtures.map(row=>{const players=playerGroups.get(row.signals.fixtureId)??{home:[],away:[]};const rows=formRows.filter(item=>String(item.fixture_id)===row.signals.fixtureId);
    const teams=[row.signals.home.publicId,row.signals.away.publicId];
    const creativeHistory=history.filter(item=>teams.includes(item.fixture_snapshot.home.publicId)||teams.includes(item.fixture_snapshot.away.publicId))
      .flatMap(item=>(item.content_pack.masterSocial?[item.content_pack.masterSocial]:Object.values(item.content_pack.platforms??{})).flatMap(draft=>draft.creative?[{channel:draft.channel,creative:draft.creative}]:[]));
    return {...row,creativeHistory,storySignals:{players,form:{home:form(rows,'home'),away:form(rows,'away')}}};});
}
export async function recentGrowthFixtureIds(db:QueryExecutor,now=new Date()):Promise<Set<string>>{
  const since=new Date(now.getTime()-SHORTLIST.duplicateWindowDays*86_400_000);
  const rows=(await db.query<{fixture_id:string}>('SELECT DISTINCT fixture_id FROM growth_content_items WHERE created_at>=$1',[since])).rows;
  return new Set(rows.map(row=>String(row.fixture_id)));
}

export function canTransitionGrowthStatus(from:GrowthChannelStatus,to:GrowthChannelStatus):boolean{
  if(from==='PUBLISHED')return false;
  if(to==='PUBLISHED')return from==='APPROVED';
  if(to==='APPROVED')return from==='DRAFT'||from==='REJECTED';
  if(to==='REJECTED')return from==='DRAFT'||from==='APPROVED';
  return false;
}

export async function transitionGrowthChannel(db:DatabaseClient,itemId:string,channel:GrowthChannel,to:GrowthChannelStatus,now=new Date()):Promise<boolean>{
  return db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('growth:'||fixture_id::text,0)) FROM growth_content_items WHERE id=$1",[itemId]);
    const current=(await tx.query<{status:GrowthChannelStatus}>(`SELECT status FROM growth_content_channels
      WHERE content_item_id=$1 AND channel=$2 AND EXISTS(SELECT 1 FROM growth_content_items i WHERE i.id=$1 AND i.superseded_at IS NULL) FOR UPDATE`,[itemId,channel])).rows[0];
    if(!current||!canTransitionGrowthStatus(current.status,to))return false;
    await tx.query(`UPDATE growth_content_channels SET status=$3,updated_at=$4,
      approved_at=CASE WHEN $3='APPROVED' THEN $4 ELSE approved_at END,
      rejected_at=CASE WHEN $3='REJECTED' THEN $4 ELSE rejected_at END,
      published_at=CASE WHEN $3='PUBLISHED' THEN $4 ELSE published_at END
      WHERE content_item_id=$1 AND channel=$2`,[itemId,channel,to,now]);
    return true;
  });
}

interface PersistInput {
  canonicalAssets?:CanonicalRender[];
  fixtureId:string;sourceHash:string;trigger:'AUTOMATIC'|'OWNER';priorityScore:number;
  scoreBreakdown:unknown;reasons:string[];fixture:GrowthFixtureSnapshot;content:GrowthContentPack;
  canonicalUrl:string;tracking:Record<GrowthChannel,string>;now:Date;force:boolean;
  /** Churn-free fingerprint of the rendered facts; decides regeneration together with the creative version. */
  contentIdentity?:string;
  videos?:GrowthVideoRenderResult[];supersedesItemId?:string|null;
  regeneratedChannel?:GrowthChannel|null;channelRecords?:GrowthChannelRecord[];
}
/** Advisory locking makes the seven-day duplicate check and revision increment atomic per fixture. */
export async function persistGrowthItem(db:DatabaseClient,input:PersistInput):Promise<{id:string;revision:number}|null>{
  return db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`growth:${input.fixtureId}`]);
    let carriedChannels=input.channelRecords;
    if(!input.force||input.content.assetModel==='MASTER_V1'){
      // Duplicate means "already produced from the same facts by the creative stack we ship today". Keying on
      // fixture + recency alone made an older stack's output suppress its own replacement forever.
      const since=new Date(input.now.getTime()-SHORTLIST.duplicateWindowDays*86_400_000);
      const duplicate=(await tx.query(`SELECT 1 FROM growth_content_items
        WHERE fixture_id=$1 AND created_at>=$2 AND creative_version=$3
          AND ($4::text IS NULL OR content_identity IS NULL OR content_identity=$4) LIMIT 1`,
        [input.fixtureId,since,CREATIVE_VERSION,input.contentIdentity??null])).rowCount;
      if(duplicate)return null;
    }
    if(input.supersedesItemId){
      // Review may change while a slow render is running. Serialize with per-platform transitions
      // before rechecking eligibility so an approval cannot race a draft replacement.
      const locked=(await tx.query<Row>('SELECT channel,status,tracked_url,approved_at,rejected_at,published_at FROM growth_content_channels WHERE content_item_id=$1 ORDER BY channel FOR UPDATE',[input.supersedesItemId])).rows;
      if(input.regeneratedChannel)carriedChannels=locked.map(row=>({channel:String(row.channel) as GrowthChannel,status:String(row.status) as GrowthChannelStatus,trackedUrl:String(row.tracked_url),
        approvedAt:row.approved_at?iso(row.approved_at):null,rejectedAt:row.rejected_at?iso(row.rejected_at):null,publishedAt:row.published_at?iso(row.published_at):null}));
      const predecessor=(await tx.query<{id:string}>(`SELECT i.id FROM growth_content_items i
        WHERE i.id=$1 AND i.superseded_at IS NULL AND (($2::text IS NULL AND NOT EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.status<>'DRAFT'))
          OR $3::boolean OR ($2::text IS NOT NULL AND EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.channel=$2 AND ch.status IN('DRAFT','REJECTED')))) FOR UPDATE`,[input.supersedesItemId,input.regeneratedChannel??null,input.content.assetModel==='MASTER_V1'])).rows[0];
      if(!predecessor)throw new Error('DRAFT_REGENERATION_NOT_ALLOWED');
    }
    const revision=Number((await tx.query<{revision:number}>('SELECT COALESCE(max(revision),0)+1 AS revision FROM growth_content_items WHERE fixture_id=$1',[input.fixtureId])).rows[0]?.revision??1);
    const content=structuredClone(input.content);
    if(content.masterSocial){
      delete content.platforms;
      const timing=input.canonicalAssets?.find(a=>a.kind==='MASTER_VIDEO')?.renderMetadata?.sceneTiming;
      if(timing)content.masterSocial.scenes=content.masterSocial.scenes.map(scene=>{const t=timing.find(x=>x.order===scene.order);return t?{...scene,startSeconds:t.startSeconds,durationSeconds:t.durationSeconds}:scene;});
    }
    for(const video of input.videos??[]){
      if(video.status!=='READY'||!video.renderMetadata||!content.platforms)continue;
      const platform=content.platforms[video.channel];
      platform.scenes=platform.scenes.map(scene=>{
        const timing=video.renderMetadata?.sceneTiming.find(row=>row.order===scene.order);
        return timing?{...scene,startSeconds:timing.startSeconds,durationSeconds:timing.durationSeconds}:scene;
      });
      if(video.renderMetadata.voice.degradedReason&&content.readiness){
        content.readiness.state='NEEDS_REVIEW';content.readiness.reasons.push(`${video.channel}: ${video.renderMetadata.voice.degradedReason}`);
      }
    }
    const item=(await tx.query<{id:string}>(`INSERT INTO growth_content_items(fixture_id,revision,generator_version,source_hash,trigger_source,
      priority_score,score_breakdown,ranking_reasons,fixture_snapshot,content_pack,canonical_url,created_at,supersedes_item_id,creative_version,content_identity)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15) RETURNING id`,[
      input.fixtureId,revision,input.content.generatorVersion,input.sourceHash,input.trigger,input.priorityScore,JSON.stringify(input.scoreBreakdown),
      JSON.stringify(input.reasons),JSON.stringify(input.fixture),JSON.stringify(content),input.canonicalUrl,input.now,input.supersedesItemId??null,
      CREATIVE_VERSION,input.contentIdentity??null])).rows[0];
    const inheritedAssets=input.supersedesItemId?(await tx.query<{channel:string;sha256:string;creative_version:string}>(
      'SELECT channel,sha256,creative_version FROM growth_platform_assets WHERE content_item_id=$1',[input.supersedesItemId])).rows:[];
    for(const channel of GROWTH_CHANNELS){const previous=carriedChannels?.find(record=>record.channel===channel);
      const before=inheritedAssets.find(a=>a.channel===channel),after=input.videos?.find(a=>a.channel===channel);
      const regenerated=input.regeneratedChannel===channel||(channel!=='EDITORIAL'&&!!previous&&(!before||before.sha256!==after?.sha256||before.creative_version!==CREATIVE_VERSION));
      await tx.query(`INSERT INTO growth_content_channels(content_item_id,channel,status,tracked_url,approved_at,rejected_at,published_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[item.id,channel,regenerated?'DRAFT':previous?.status??'DRAFT',input.tracking[channel],
        regenerated?null:previous?.approvedAt??null,regenerated?null:previous?.rejectedAt??null,regenerated?null:previous?.publishedAt??null,input.now]);}
    for(const asset of input.canonicalAssets??[])await tx.query(`INSERT INTO growth_canonical_assets(content_item_id,kind,creative_version,mime_type,width,height,sha256,byte_length,asset_data,render_metadata,generated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,[item.id,asset.kind,CREATIVE_VERSION,asset.mimeType,asset.width,asset.height,asset.sha256,asset.byteLength,asset.data,asset.renderMetadata?JSON.stringify(asset.renderMetadata):null,input.now]);
    for(const video of input.videos??[])await tx.query(`INSERT INTO growth_platform_assets(content_item_id,channel,status,mime_type,sha256,byte_length,video_data,error_code,generated_at,updated_at,render_metadata,creative_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $3='READY' THEN $9::timestamptz ELSE NULL END,$9::timestamptz,$10::jsonb,$11)`,[item.id,video.channel,video.status,video.mimeType,video.sha256,video.byteLength,video.data,video.status==='FAILED'?video.errorCode:null,input.now,video.status==='READY'&&video.renderMetadata?JSON.stringify(video.renderMetadata):null,CREATIVE_VERSION]);
    if(input.supersedesItemId)await tx.query('UPDATE growth_content_items SET superseded_at=$2 WHERE id=$1',[input.supersedesItemId,input.now]);
    return {id:item.id,revision};
  });
}

export async function acquireGrowthJob(db:DatabaseClient,trigger:'AUTOMATIC'|'OWNER',now=new Date()):Promise<string|null>{
  try{return await db.transaction(async tx=>{
    await tx.query(`UPDATE growth_generation_jobs SET status='FAILED',completed_at=$1,error_code='LEASE_EXPIRED'
      WHERE status='RUNNING' AND lease_expires_at<$1`,[now]);
    const row=(await tx.query<{id:string}>(`INSERT INTO growth_generation_jobs(status,trigger_source,lease_expires_at,heartbeat_at,started_at)
      VALUES('RUNNING',$1,$2,$3,$3) RETURNING id`,[trigger,new Date(now.getTime()+600_000),now])).rows[0];
    return row.id;
  });}catch(error){return (error as {code?:string}).code==='23505'?null:Promise.reject(error);}
}

export async function finishGrowthJob(db:QueryExecutor,id:string,state:'SUCCEEDED'|'PARTIAL'|'FAILED',result:{considered:number;generated:number;skippedDuplicate:number;pending?:number;staleRegenerated?:number;error?:string},now=new Date()){
  await db.query(`UPDATE growth_generation_jobs SET status=$2,considered=$3,generated=$4,skipped_duplicate=$5,
    result=$6::jsonb,error_code=$7,completed_at=$8,heartbeat_at=$8 WHERE id=$1`,[id,state,result.considered,result.generated,result.skippedDuplicate,
    JSON.stringify(result),result.error??null,now]);
}

function hydrateItem(row:Row):GrowthContentItem{
  const channels=asJson<Array<Record<string,unknown>>>(row.channels??[]).map((channel):GrowthChannelRecord=>({
    channel:String(channel.channel) as GrowthChannel,status:String(channel.status) as GrowthChannelStatus,trackedUrl:String(channel.tracked_url),
    approvedAt:channel.approved_at?iso(channel.approved_at):null,rejectedAt:channel.rejected_at?iso(channel.rejected_at):null,
    publishedAt:channel.published_at?iso(channel.published_at):null,
  }));
  return {id:String(row.id),fixtureId:String(row.fixture_id),revision:Number(row.revision),sourceHash:String(row.source_hash),
    creativeVersion:text(row.creative_version),contentIdentity:text(row.content_identity),
    trigger:String(row.trigger_source) as GrowthContentItem['trigger'],priorityScore:Number(row.priority_score),
    scoreBreakdown:asJson(row.score_breakdown),reasons:asJson(row.ranking_reasons),canonicalUrl:String(row.canonical_url),
    fixture:asJson(row.fixture_snapshot),content:asJson(row.content_pack),channels,supersedesItemId:text(row.supersedes_item_id),
    supersededAt:row.superseded_at?iso(row.superseded_at):null,createdAt:iso(row.created_at)};
}

const itemSelect=`SELECT i.*,COALESCE(jsonb_agg(jsonb_build_object('channel',ch.channel,'status',ch.status,'tracked_url',ch.tracked_url,
  'approved_at',ch.approved_at,'rejected_at',ch.rejected_at,'published_at',ch.published_at) ORDER BY ch.channel)
  FILTER(WHERE ch.channel IS NOT NULL),'[]'::jsonb) AS channels
  FROM growth_content_items i LEFT JOIN growth_content_channels ch ON ch.content_item_id=i.id`;

export async function readLatestGrowthItems(db:QueryExecutor,limit=100):Promise<GrowthContentItem[]>{
  let rows:Row[];
  // Current queue first, in this run's ranking order; everything else stays reachable behind it as history.
  try{rows=(await db.query<Row>(`${itemSelect} GROUP BY i.id
    ORDER BY (i.current_rank IS NULL),i.current_rank ASC,i.created_at DESC,i.id DESC LIMIT $1`,[limit])).rows;}
  catch(error){if((error as {code?:string}).code!=='42703')throw error;rows=(await db.query<Row>(`${itemSelect} GROUP BY i.id ORDER BY i.created_at DESC,i.id DESC LIMIT $1`,[limit])).rows;}
  return await hydrateAssets(db,rows.map(hydrateItem));
}

export async function readGrowthItem(db:QueryExecutor,id:string):Promise<GrowthContentItem|null>{
  const row=(await db.query<Row>(`${itemSelect} WHERE i.id=$1 GROUP BY i.id`,[id])).rows[0];
  if(!row)return null;return (await hydrateAssets(db,[hydrateItem(row)]))[0]??null;
}

async function hydrateAssets(db:QueryExecutor,items:GrowthContentItem[]):Promise<GrowthContentItem[]>{
  if(!items.length)return items;
  try{
    const ids=items.map(item=>item.id);
    const sql=(metadata:string)=>`SELECT content_item_id,channel,status,mime_type,sha256,byte_length,error_code,generated_at,creative_version,${metadata}
      FROM growth_platform_assets WHERE content_item_id=ANY($1::uuid[]) ORDER BY content_item_id,channel`;
    let rows:Row[];
    try{rows=(await db.query<Row>(sql('render_metadata'),[ids])).rows;}
    catch(error){if((error as {code?:string}).code!=='42703')throw error;rows=(await db.query<Row>(sql('NULL::jsonb AS render_metadata'),[ids])).rows;}
    let canonical:Row[]=[];
    if(items.some(item=>item.content.assetModel==='MASTER_V1'))canonical=(await db.query<Row>(`SELECT id,content_item_id,kind,creative_version,mime_type,width,height,sha256,byte_length,render_metadata,generated_at FROM growth_canonical_assets WHERE content_item_id=ANY($1::uuid[])`,[ids])).rows;
    return items.map(item=>exposeMaster({...item,canonicalAssets:canonical.filter(a=>String(a.content_item_id)===item.id).map((a):GrowthCanonicalAsset=>({id:String(a.id),kind:a.kind as GrowthAssetKind,creativeVersion:String(a.creative_version),mimeType:a.mime_type as GrowthCanonicalAsset['mimeType'],width:1080,height:Number(a.height) as 1920|1350,sha256:String(a.sha256),byteLength:Number(a.byte_length),generatedAt:iso(a.generated_at),renderMetadata:a.render_metadata?asJson(a.render_metadata):undefined})),platformAssets:rows.filter(row=>String(row.content_item_id)===item.id).map((row):GrowthPlatformAsset=>({channel:String(row.channel) as GrowthPlatformAsset['channel'],
      creativeVersion:text(row.creative_version),status:String(row.status) as 'READY'|'FAILED'|'PENDING',mimeType:text(row.mime_type),sha256:text(row.sha256),byteLength:numeric(row.byte_length),generatedAt:row.generated_at?iso(row.generated_at):null,errorCode:text(row.error_code),renderMetadata:row.render_metadata?asJson(row.render_metadata):undefined}))}));
  }catch(error){const code=(error as {code?:string}).code;if(code==='42P01'||code==='42703')return items;throw error;}
}

export async function readGrowthVideo(db:QueryExecutor,itemId:string,channel:string){
  try{const master=await readCanonicalAsset(db,itemId,'MASTER_VIDEO');if(master)return master;}
  catch(error){if((error as {code?:string}).code!=='42P01')throw error;}
  const sql=(metadata:string)=>`SELECT video_data,mime_type,sha256,byte_length,${metadata} FROM growth_platform_assets WHERE content_item_id=$1 AND channel=$2 AND status='READY'`;
  let row:Row|undefined;
  try{row=(await db.query<Row>(sql('render_metadata'),[itemId,channel])).rows[0];}
  catch(error){if((error as {code?:string}).code!=='42703')throw error;row=(await db.query<Row>(sql('NULL::jsonb AS render_metadata'),[itemId,channel])).rows[0];}
  if(!row||!Buffer.isBuffer(row.video_data))return null;
  return {data:row.video_data as Buffer,mimeType:String(row.mime_type),sha256:String(row.sha256),byteLength:Number(row.byte_length),renderMetadata:row.render_metadata?asJson<GrowthPlatformAsset['renderMetadata']>(row.render_metadata):undefined};
}

export async function readCanonicalAsset(db:QueryExecutor,itemId:string,kind:GrowthAssetKind){
  const row=(await db.query<Row>('SELECT asset_data,mime_type,sha256,byte_length,render_metadata FROM growth_canonical_assets WHERE content_item_id=$1 AND kind=$2',[itemId,kind])).rows[0];
  if(!row||!Buffer.isBuffer(row.asset_data))return null;
  return {data:row.asset_data as Buffer,mimeType:String(row.mime_type),sha256:String(row.sha256),byteLength:Number(row.byte_length),renderMetadata:row.render_metadata?asJson<GrowthPlatformAsset['renderMetadata']>(row.render_metadata):undefined};
}

export interface GrowthSeoUpsert {fixtureId:string;rank:number;score:number;topSocial:boolean;canonicalUrl:string;seo:GrowthSeoPriority;sourceHash:string;}
export async function upsertGrowthSeoPriorities(db:DatabaseClient,rows:GrowthSeoUpsert[],now=new Date()){
  await db.transaction(async tx=>{
    await tx.query('UPDATE growth_seo_priorities SET active=false,updated_at=$1 WHERE active',[now]);
    for(const row of rows)await tx.query(`INSERT INTO growth_seo_priorities(fixture_id,priority_rank,priority_score,top_social,canonical_url,intent_cluster,placements,context_pt_br,source_hash,active,updated_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,true,$10)
      ON CONFLICT(fixture_id) DO UPDATE SET priority_rank=EXCLUDED.priority_rank,priority_score=EXCLUDED.priority_score,top_social=EXCLUDED.top_social,
      canonical_url=EXCLUDED.canonical_url,intent_cluster=EXCLUDED.intent_cluster,placements=EXCLUDED.placements,context_pt_br=EXCLUDED.context_pt_br,
      source_hash=EXCLUDED.source_hash,active=true,updated_at=EXCLUDED.updated_at`,[row.fixtureId,row.rank,row.score,row.topSocial,row.canonicalUrl,JSON.stringify(row.seo.intent),JSON.stringify(row.seo.placements),row.seo.context,row.sourceHash,now]);
  });
}

export async function readV1DraftsForRegeneration(db:QueryExecutor){
  return (await db.query<{id:string;fixture_id:string}>(`SELECT DISTINCT ON(i.fixture_id) i.id,i.fixture_id FROM growth_content_items i
    WHERE i.generator_version<2 AND i.superseded_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.status<>'DRAFT')
    ORDER BY i.fixture_id,i.revision DESC`)).rows;
}

export async function readPremiumDraftsForRegeneration(db:QueryExecutor){
  return (await db.query<{id:string;fixture_id:string}>(`SELECT DISTINCT ON(i.fixture_id) i.id,i.fixture_id FROM growth_content_items i
    WHERE i.superseded_at IS NULL AND (
      COALESCE(i.content_pack#>>'{platforms,TIKTOK,creative,version}','')<>'PREMIUM_1'
      OR EXISTS(SELECT 1 FROM growth_platform_assets a WHERE a.content_item_id=i.id
        AND (a.status<>'READY' OR a.render_metadata#>>'{voice,degradedReason}' IS NOT NULL)))
      AND NOT EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.status<>'DRAFT')
    ORDER BY i.fixture_id,i.revision DESC`)).rows;
}

/** One-time rights-policy repair: only current, all-DRAFT V1.1 items whose player-led story has no approved commercial image. */
export async function readRightsFallbackDraftsForRegeneration(db:QueryExecutor){
  return (await db.query<{id:string;fixture_id:string}>(`SELECT DISTINCT ON(i.fixture_id) i.id,i.fixture_id FROM growth_content_items i
    WHERE i.generator_version=2 AND i.superseded_at IS NULL
      AND i.content_pack->'story'->>'angle' IN('PLAYER_VS_PLAYER','STAR_FOCUS')
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(i.content_pack->'players','[]'::jsonb)) player
        WHERE COALESCE((player#>>'{media,commercialEligible}')::boolean,false) AND NULLIF(player#>>'{media,assetUrl}','') IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.status<>'DRAFT')
    ORDER BY i.fixture_id,i.revision DESC`)).rows;
}

/**
 * Rebuild the CURRENT queue from the ranking just computed. History is every row we have ever written;
 * "current" is only the latest Top 10, so a fixture leaving the Top 10 simply stops being current — its
 * item, its metadata and its media all stay exactly where they are.
 *
 * One statement per run inside a transaction, so a retry or an overlapping run cannot leave two queues.
 */
export async function rebuildCurrentGrowthQueue(db:DatabaseClient,
  entries:ReadonlyArray<{fixtureId:string;rank:number;topSocial:boolean}>,now=new Date()):Promise<{current:number}>{
  return db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['growth:current-queue']);
    await tx.query('UPDATE growth_content_items SET current_rank=NULL,current_shortlist=false WHERE current_rank IS NOT NULL');
    if(!entries.length)return {current:0};
    // Newest non-superseded item per fixture carries the rank, so the queue points at what the owner should see.
    const updated=await tx.query(`WITH wanted AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(fixture_id uuid,rank integer,top_social boolean)
      ), newest AS (
        SELECT DISTINCT ON (i.fixture_id) i.id,i.fixture_id FROM growth_content_items i
        JOIN wanted w ON w.fixture_id=i.fixture_id
        WHERE i.superseded_at IS NULL ORDER BY i.fixture_id,i.created_at DESC,i.id DESC
      )
      UPDATE growth_content_items SET current_rank=w.rank,current_shortlist=w.top_social,current_at=$2
      FROM wanted w JOIN newest n ON n.fixture_id=w.fixture_id WHERE growth_content_items.id=n.id`,
      [JSON.stringify(entries.map(e=>({fixture_id:e.fixtureId,rank:e.rank,top_social:e.topSocial}))),now]);
    return {current:updated.rowCount??0};
  });
}

/**
 * Active items whose creative stack is older than today's. Each earns exactly one regeneration: once the
 * replacement is stored with the current version the predecessor is superseded, so the next run sees
 * nothing stale and skips again. Ordered so the social shortlist is refreshed before the wider list.
 */
export async function staleCreativeGrowthItems(db:QueryExecutor,limit:number,creativeVersion:string):Promise<Array<{id:string;fixture_id:string}>>{
  return (await db.query<{id:string;fixture_id:string}>(`SELECT i.id,i.fixture_id FROM growth_content_items i
    WHERE i.superseded_at IS NULL AND i.current_rank IS NOT NULL
      AND (i.creative_version IS DISTINCT FROM $2)
      AND NOT EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.status NOT IN('DRAFT','REJECTED'))
    ORDER BY i.current_shortlist DESC,i.current_rank ASC LIMIT $1`,[limit,creativeVersion])).rows;
}
