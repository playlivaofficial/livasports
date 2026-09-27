import {generatedContent,generateV11ContentPack} from './content';
import {rankedFixture} from './fixtures.test-support';
import {VIDEO_CHANNELS} from './config';
import {CREATIVE_VERSION} from './creative-version';
import type {GrowthContentItem} from './types';
export function publishingItem():GrowthContentItem {
  const row=rankedFixture(),g={...generatedContent(row),content:generateV11ContentPack(row)};
  return {id:'22222222-2222-4222-8222-222222222222',fixtureId:row.signals.fixtureId,revision:2,sourceHash:g.sourceHash,contentIdentity:g.contentIdentity,
    creativeVersion:CREATIVE_VERSION,trigger:'OWNER',priorityScore:row.priority.total,scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,
    canonicalUrl:row.destinationUrl,fixture:g.fixture,content:g.content,createdAt:'2026-09-27T10:00:00Z',
    channels:VIDEO_CHANNELS.map(channel=>({channel,status:'DRAFT',trackedUrl:g.tracking[channel],approvedAt:null,rejectedAt:null,publishedAt:null})),
    platformAssets:VIDEO_CHANNELS.map(channel=>({channel,creativeVersion:CREATIVE_VERSION,status:'READY',mimeType:'video/mp4',sha256:'a'.repeat(64),byteLength:100,generatedAt:'2026-09-27T10:00:00Z',errorCode:null}))};
}
