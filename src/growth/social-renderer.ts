import 'server-only';
import {VIDEO_CHANNELS,type GrowthVideoChannel} from './config';
import {draftCompliance,socialDraftIdentity,socialMasterIdentity,SOCIAL_POLICY_VERSION} from './socialCompliance';
import {growthSceneSvg,remoteAsset,type VideoRendererOptions} from './video-renderer';
import {renderCanonicalPackage,type CanonicalRender} from './canonical-renderer';
import type {GrowthFixtureSnapshot,GrowthPlatformDraft,SocialAssetProof} from './types';

/** Exact text from deterministic SVG layers; unreviewed raster assets are blocked by draftCompliance. */
export const svgText=(svg:string)=>[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/<[^>]+>/g,'')).join(' ');
export async function socialFrames(draft:GrowthPlatformDraft,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}){
  if(draftCompliance(draft).status!=='ready')throw Error('SOCIAL_BLOCKED_FOR_REVIEW');
  const frames=[];
  for(const scene of draft.scenes)frames.push(await growthSceneSvg(scene,fixture,draft,{...options,master:true}));
  if(draftCompliance(draft,frames.map(svgText)).status!=='ready')throw Error('SOCIAL_RENDER_BLOCKED_FOR_REVIEW');
  return frames;
}
/** All-or-nothing package. No paid retries, generic fallback, publication or provider fetch here. */
export async function renderSocialPackage(drafts:Record<GrowthVideoChannel,GrowthPlatformDraft>,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<CanonicalRender[]>{
  // Validate every platform before spending any narration credits.
  for(const channel of VIDEO_CHANNELS)if(draftCompliance(drafts[channel]).status!=='ready')throw Error('SOCIAL_BLOCKED_FOR_REVIEW');
  const master=drafts.INSTAGRAM_REELS;
  for(const channel of VIDEO_CHANNELS)if(socialMasterIdentity(drafts[channel])!==socialMasterIdentity(master))throw Error('SOCIAL_MASTER_MISMATCH');
  const sourceLoader=options.assetLoader??remoteAsset,assets=new Map<string,Promise<string|null>>();
  options={...options,assetLoader:url=>{let value=assets.get(url);if(!value){value=sourceLoader(url);assets.set(url,value);}return value;}};
  const frames=await socialFrames(master,fixture,options);
  for(const channel of VIDEO_CHANNELS)if(draftCompliance(drafts[channel],frames.map(svgText)).status!=='ready')throw Error('SOCIAL_RENDER_BLOCKED_FOR_REVIEW');
  // Exactly one encode plus two statics. Policy profiles never create media copies.
  const result=await renderCanonicalPackage(master,fixture,{...options,master:true,requireNarration:true});
  const video=result.find(a=>a.kind==='MASTER_VIDEO')!,cover=result.find(a=>a.kind==='STORY_IMAGE')!,feed=result.find(a=>a.kind==='FEED_IMAGE')!;
  if(!video?.renderMetadata||!cover||!feed||video.renderMetadata.voice.degradedReason||video.renderMetadata.voice.lines!==master.scenes.length)throw Error('NARRATION_INCOMPLETE_KEEP_PREDECESSOR');
  video.renderMetadata.socialProofs=Object.fromEntries(VIDEO_CHANNELS.map(channel=>[channel,{
    policyVersion:SOCIAL_POLICY_VERSION,status:'ready',rejectionReasons:[],draftIdentity:socialDraftIdentity(drafts[channel]),
    videoSha256:video.sha256,coverSha256:cover.sha256,feedSha256:feed.sha256,checkedAt:new Date().toISOString(),
  } satisfies SocialAssetProof]));
  return result;
}
