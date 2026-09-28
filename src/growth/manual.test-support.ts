import {generatedContent} from './content';
import {socialDraftIdentity,SOCIAL_POLICY_VERSION} from './socialCompliance';
import {rankedFixture} from './fixtures.test-support';
import {VIDEO_CHANNELS} from './config';
import {CREATIVE_VERSION} from './creative-version';
import type {GrowthContentItem,GrowthRenderMetadata} from './types';
import {exposeMaster} from './master-model';
export function publishingItem():GrowthContentItem {
  const row=rankedFixture(),g=generatedContent(row,1,[],new Date('2026-09-27T10:00:00Z'));
  const renderMetadata:GrowthRenderMetadata={voice:{mode:'EDITORIAL',provider:'test',lines:g.content.masterSocial!.scenes.length,degradedReason:null},characterMode:'NONE',scenery:[],durationSeconds:20,renderMs:1,sceneTiming:[],
    socialProofs:Object.fromEntries(VIDEO_CHANNELS.map(channel=>[channel,{policyVersion:SOCIAL_POLICY_VERSION,status:'ready',rejectionReasons:[],draftIdentity:socialDraftIdentity(g.content.platforms![channel]),videoSha256:'a'.repeat(64),coverSha256:'b'.repeat(64),feedSha256:'c'.repeat(64),checkedAt:'2026-09-27T10:00:00Z'}]))};
  return exposeMaster({id:'22222222-2222-4222-8222-222222222222',fixtureId:row.signals.fixtureId,revision:2,sourceHash:g.sourceHash,contentIdentity:g.contentIdentity,
    creativeVersion:CREATIVE_VERSION,trigger:'OWNER',priorityScore:row.priority.total,scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,
    canonicalUrl:row.destinationUrl,fixture:g.fixture,content:g.content,createdAt:'2026-09-27T10:00:00Z',
    channels:VIDEO_CHANNELS.map(channel=>({channel,status:'DRAFT',trackedUrl:g.tracking[channel],approvedAt:null,rejectedAt:null,publishedAt:null})),
    canonicalAssets:(['MASTER_VIDEO','STORY_IMAGE','FEED_IMAGE'] as const).map((kind,i)=>({id:kind,kind,creativeVersion:CREATIVE_VERSION,mimeType:kind==='MASTER_VIDEO'?'video/mp4':'image/png',width:1080,height:kind==='FEED_IMAGE'?1350:1920,sha256:['a','b','c'][i].repeat(64),byteLength:100,generatedAt:'2026-09-27T10:00:00Z',renderMetadata:kind==='MASTER_VIDEO'?renderMetadata:undefined}))});
}
