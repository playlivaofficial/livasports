import {VIDEO_CHANNELS,type GrowthVideoChannel} from './config';
import type {GrowthContentItem,GrowthContentPack,GrowthPlatformDraft} from './types';

/** Compatibility projection, never three persisted packages or three media blobs. */
export function platformViews(content:GrowthContentPack):Record<GrowthVideoChannel,GrowthPlatformDraft>|undefined {
  if(!content.masterSocial)return content.platforms;
  return Object.fromEntries(VIDEO_CHANNELS.map(channel=>[channel,{...content.masterSocial!,channel}])) as Record<GrowthVideoChannel,GrowthPlatformDraft>;
}
export function exposeMaster(item:GrowthContentItem):GrowthContentItem {
  if(!item.content.masterSocial)return item;
  const master=item.canonicalAssets?.find(a=>a.kind==='MASTER_VIDEO');
  return {...item,content:{...item.content,platforms:platformViews(item.content)},platformAssets:master?VIDEO_CHANNELS.map(channel=>({
    channel,creativeVersion:master.creativeVersion,status:'READY',mimeType:master.mimeType,sha256:master.sha256,byteLength:master.byteLength,
    generatedAt:master.generatedAt,errorCode:null,renderMetadata:master.renderMetadata})):[]};
}
export function canonicalAssetUrl(item:GrowthContentItem,kind:'MASTER_VIDEO'|'STORY_IMAGE'|'FEED_IMAGE',download=false){
  const asset=item.canonicalAssets?.find(a=>a.kind===kind);if(!asset)return null;
  const query=new URLSearchParams({current:'1',version:asset.creativeVersion,sha:asset.sha256});if(download)query.set('download','1');
  return `/api/owner/growth/items/${item.id}/media/${kind}?${query}`;
}
