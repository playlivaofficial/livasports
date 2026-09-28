import {CHANNEL_UTM,type GrowthVideoChannel} from './config';
import {CREATIVE_VERSION} from './creative-version';
import type {GrowthContentItem} from './types';
import {canonicalAssetUrl} from './master-model';
import {draftCompliance,SOCIAL_POLICY_VERSION,matchesSocialDraftIdentity,socialMasterIdentity,platformComplianceCheck} from './socialCompliance';

export type PublishingState='DRAFT'|'READY_TO_POST'|'POSTED'|'REJECTED'|'SUPERSEDED'|'blocked_for_review';
export interface PostSnapshot {
  title:string;hook:string;caption:string;hashtags:string;cta:string;fullText:string;trackedUrl:string;
  storyAngle:string;creativeFamily:string;utmSource:string;utmCampaign:string;utmContent:string;
}
export interface ManualPost {
  id:string;itemId:string;channel:GrowthVideoChannel;fixtureId:string;fixtureLabel:string;revision:number;
  creativeVersion:string;contentIdentity:string;assetSha256:string;generatedAt:string;postedAt:string;
  externalPostUrl:string|null;notes:string|null;postedBy:string;snapshot:PostSnapshot;superseded:boolean;
  metrics:{sessions:number;matchViews:number;odds:number;slipAdds:number;clicks:number};
}
export type PostingReceipt=Omit<ManualPost,'metrics'|'superseded'|'fixtureLabel'|'revision'>;
export interface PublishingOverview {posts:ManualPost[];currentPosts?:PostingReceipt[];total:number;today:number;last7Days:number;byPlatform:Record<string,number>;}

/** No renderer, generator or provider dependency: these actions consume immutable stored output. */
export function postSnapshot(item:GrowthContentItem,channel:GrowthVideoChannel):PostSnapshot {
  if(!socialExportReady(item,channel))throw Error('SOCIAL_BLOCKED_FOR_REVIEW');
  const draft=item.content.platforms?.[channel];
  const asset=item.platformAssets?.find(a=>a.channel===channel);
  if(!draft||!asset?.sha256)throw new Error('PUBLISHING_ASSET_UNAVAILABLE');
  const url=new URL(item.canonicalUrl);
  if(url.origin!=='https://livasports.com')throw new Error('INVALID_CANONICAL_URL');
  url.search='';url.hash='';
  const utmContent=`match_${item.fixture.publicId}_r${item.revision}_${asset.sha256.slice(0,12)}`;
  url.searchParams.set('utm_source',CHANNEL_UTM[channel].source);
  url.searchParams.set('utm_medium','social');url.searchParams.set('utm_campaign','traffic_engine_v1');url.searchParams.set('utm_content',utmContent);
  const caption=channel==='YOUTUBE_SHORTS'?draft.description:draft.caption;
  const hashtags=draft.hashtags.join(' '),trackedUrl=url.toString();
  if(platformComplianceCheck(channel,{caption,hashtags:draft.hashtags,cta:draft.cta,urls:[trackedUrl]}).status!=='ready')throw Error('SOCIAL_BLOCKED_FOR_REVIEW');
  return {title:draft.title,hook:draft.hook,caption,hashtags,cta:draft.cta,trackedUrl,
    fullText:[caption,hashtags,trackedUrl].filter(Boolean).join('\n\n'),
    storyAngle:item.content.story?.angle??'LEGACY',creativeFamily:draft.creative?.family??draft.template,
    utmSource:CHANNEL_UTM[channel].source,utmCampaign:'traffic_engine_v1',utmContent};
}
export function publicationIdentity(item:GrowthContentItem,channel:GrowthVideoChannel):string {
  // A changed rendered asset is a fresh publishing decision, even when the acquisition facts did not change.
  return `${item.contentIdentity??item.sourceHash}:${item.content.story?.angle??'LEGACY'}:${item.platformAssets?.find(a=>a.channel===channel)?.sha256??'NO_ASSET'}`;
}
export function currentAssetReady(item:GrowthContentItem,channel:GrowthVideoChannel):boolean {
  const asset=item.platformAssets?.find(a=>a.channel===channel);
  return socialExportReady(item,channel)&&!item.supersededAt&&item.creativeVersion===CREATIVE_VERSION&&asset?.creativeVersion===CREATIVE_VERSION
    &&asset.status==='READY'&&asset.mimeType==='video/mp4'&&!!asset.sha256&&!!asset.generatedAt
    &&!!item.content.platforms?.[channel]&&item.content.readiness?.state!=='NEEDS_REVIEW'
    &&!asset.renderMetadata?.voice.degradedReason;
}
export function socialExportReady(item:GrowthContentItem,channel:GrowthVideoChannel):boolean{
  const draft=item.content.platforms?.[channel],asset=item.platformAssets?.find(a=>a.channel===channel),proof=asset?.socialProof;
  const master=item.canonicalAssets?.find(a=>a.kind==='MASTER_VIDEO'),cover=item.canonicalAssets?.find(a=>a.kind==='STORY_IMAGE'),feed=item.canonicalAssets?.find(a=>a.kind==='FEED_IMAGE');
  return item.content.assetModel==='SOCIAL_V2'&&!!draft&&!!proof&&proof.status==='ready'&&proof.policyVersion===SOCIAL_POLICY_VERSION
    &&!!master&&!!cover&&!!feed&&!!item.content.masterSocial&&socialMasterIdentity(draft)===socialMasterIdentity(item.content.masterSocial)
    &&master.sha256===proof.videoSha256&&cover.sha256===proof.coverSha256&&feed.sha256===proof.feedSha256
    &&master.renderMetadata?.voice.lines===draft.scenes.length&&!master.renderMetadata.voice.degradedReason
    &&asset?.status==='READY'&&asset.mimeType==='video/mp4'&&Number.isFinite(Date.parse(proof.checkedAt))
    &&/^[a-f0-9]{64}$/.test(proof.videoSha256)&&/^[a-f0-9]{64}$/.test(proof.coverSha256)
    &&draft.social?.sourceFixtureId===item.fixtureId
    &&Array.isArray(proof.rejectionReasons)&&proof.rejectionReasons.length===0&&draftCompliance(draft).status==='ready'&&matchesSocialDraftIdentity(draft,proof.draftIdentity)
    &&proof.videoSha256===asset?.sha256&&!!proof.coverSha256&&proof.coverSha256===asset?.coverSha256;
}
export function publishingState(item:GrowthContentItem,channel:GrowthVideoChannel,post?:PostingReceipt):PublishingState {
  if(item.supersededAt)return 'SUPERSEDED';
  const record=item.channels.find(r=>r.channel===channel);
  if(post||record?.status==='PUBLISHED')return 'POSTED';
  if(record?.status==='REJECTED')return 'REJECTED';
  if(!socialExportReady(item,channel))return 'blocked_for_review';
  return currentAssetReady(item,channel)?'READY_TO_POST':'DRAFT';
}
export function matchingPost(item:GrowthContentItem,channel:GrowthVideoChannel,posts:PostingReceipt[]){
  return posts.find(p=>p.fixtureId===item.fixtureId&&p.channel===channel&&p.contentIdentity===publicationIdentity(item,channel)&&p.creativeVersion===item.creativeVersion);
}
export function currentVideoUrl(item:GrowthContentItem,channel:GrowthVideoChannel,download=false):string|null {
  if(!currentAssetReady(item,channel))return null;
  if(item.content.masterSocial)return canonicalAssetUrl(item,'MASTER_VIDEO',download);
  const asset=item.platformAssets!.find(a=>a.channel===channel)!;
  const query=new URLSearchParams({current:'1',version:item.creativeVersion!,sha:asset.sha256!});
  if(download)query.set('download','1');
  return `/api/owner/growth/items/${item.id}/video/${channel}?${query}`;
}
export function videoFilename(item:GrowthContentItem,channel:GrowthVideoChannel):string {
  const slug=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'team';
  return `livasports_${channel.toLowerCase()}_${slug(item.fixture.home.name)}-vs-${slug(item.fixture.away.name)}_${item.fixture.kickoff.slice(0,10)}_r${item.revision}.mp4`;
}
export function validExternalPostUrl(value:unknown):string|null {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||value.length>1000)throw new Error('INVALID_POST_URL');
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||/[\u0000-\u001f]/.test(value))throw Error();return url.toString();}
  catch{throw new Error('INVALID_POST_URL');}
}
