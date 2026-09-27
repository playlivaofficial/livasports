import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
import {publishingItem} from './manual.test-support';
import {VIDEO_CHANNELS} from './config';
import {CREATIVE_VERSION} from './creative-version';
import {currentAssetReady,currentVideoUrl,matchingPost,postSnapshot,publicationIdentity,publishingState,validExternalPostUrl,videoFilename,type ManualPost} from './manual-publishing';
import {PublishingCard} from './ManualPublishing';
import {latestQueueItems} from './GrowthQueue';

describe('manual social publishing contract',()=>{
  it('pins primary downloads to the exact current platform, version and hash',()=>{
    const item=publishingItem(),url=currentVideoUrl(item,'TIKTOK',true)!;
    expect(url).toContain('/video/TIKTOK?');expect(new URL(url,'https://livasports.com').searchParams.get('version')).toBe(CREATIVE_VERSION);
    expect(url).toContain('sha='+ 'a'.repeat(64));expect(url).toContain('download=1');
    expect(videoFilename({...item,fixture:{...item.fixture,home:{...item.fixture.home,name:'São Paulo / "\r\n'},away:{...item.fixture.away,name:'Athletic Club'}}},'TIKTOK')).toBe('livasports_tiktok_sao-paulo-vs-athletic-club_2026-09-22_r2.mp4');
  });
  it.each(['superseded','old item','old asset','failed','needs review','degraded'])('never exposes a %s asset as the primary download',kind=>{
    const item=publishingItem();
    if(kind==='superseded')item.supersededAt='2026-09-27T11:00:00Z';
    if(kind==='old item')item.creativeVersion='old';if(kind==='old asset')item.platformAssets![0].creativeVersion='old';
    if(kind==='failed')item.platformAssets![0].status='FAILED';if(kind==='needs review')item.content.readiness!.state='NEEDS_REVIEW';
    if(kind==='degraded')item.platformAssets![0].renderMetadata={voice:{degradedReason:'NO_CREDITS'}} as never;
    expect(currentVideoUrl(item,'TIKTOK',true)).toBeNull();
  });
  it('copies exact stored platform-specific public copy, not script/debug or internal provenance',()=>{
    const item=publishingItem();
    for(const channel of VIDEO_CHANNELS){const copy=postSnapshot(item,channel),draft=item.content.platforms![channel];
      expect(copy.caption).toBe(channel==='YOUTUBE_SHORTS'?draft.description:draft.caption);expect(copy.title).toBe(draft.title);
      expect(copy.hashtags).toBe(draft.hashtags.join(' '));expect(copy.fullText).toBe([copy.caption,copy.hashtags,copy.trackedUrl].join('\n\n'));
      expect(copy.fullText).not.toContain('OWNER_QA');expect(copy.fullText).not.toContain(item.id);
    }
    expect(new Set(VIDEO_CHANNELS.map(c=>postSnapshot(item,c).caption)).size).toBe(3);
  });
  it('keeps stable existing campaign/source attribution with a public creative discriminator',()=>{
    const item=publishingItem();const copies=VIDEO_CHANNELS.map(c=>postSnapshot(item,c));
    expect(copies.map(c=>c.utmSource)).toEqual(['tiktok','instagram','youtube']);
    for(const copy of copies){const url=new URL(copy.trackedUrl);expect(url.pathname).toBe(new URL(item.canonicalUrl).pathname);
      expect(url.searchParams.get('utm_campaign')).toBe('traffic_engine_v1');expect(copy.utmContent).toMatch(/^match_[a-f0-9]+_r2_[a-f0-9]+$/);}
    expect(postSnapshot(item,'TIKTOK')).toEqual(postSnapshot(item,'TIKTOK'));
  });
  it('derives readiness without changing approval; rejects rejected assets; preserves posted history across a version change',()=>{
    const item=publishingItem();expect(currentAssetReady(item,'TIKTOK')).toBe(true);expect(publishingState(item,'TIKTOK')).toBe('READY_TO_POST');
    item.channels[0].status='REJECTED';expect(publishingState(item,'TIKTOK')).toBe('REJECTED');item.channels[0].status='DRAFT';
    const old={fixtureId:item.fixtureId,channel:'TIKTOK',contentIdentity:publicationIdentity(item,'TIKTOK'),creativeVersion:'previous-stack',postedAt:'2026-09-25T10:00:00Z'} as ManualPost;
    const history=[old];expect(matchingPost(item,'TIKTOK',history)).toBeUndefined();expect(publishingState(item,'TIKTOK')).toBe('READY_TO_POST');expect(history).toEqual([old]);
    expect(matchingPost(item,'TIKTOK',[{...old,creativeVersion:CREATIVE_VERSION}])).toBeDefined();
    item.platformAssets![0].sha256='b'.repeat(64);expect(matchingPost(item,'TIKTOK',[{...old,creativeVersion:CREATIVE_VERSION}])).toBeUndefined();
  });
  it('selects the newest unsuperseded revision even when old rank markers sort first',()=>{
    const item=publishingItem(),newer={...item,id:'new',revision:3};expect(latestQueueItems([item,newer]).get(item.fixtureId)?.id).toBe('new');
    expect(latestQueueItems([item,{...newer,supersededAt:'now'}]).get(item.fixtureId)?.id).toBe(item.id);
  });
  it.each(['javascript:alert(1)','http://example.com','https://name:pass@example.com','not url'])('rejects unsafe external URL %s',url=>expect(()=>validExternalPostUrl(url)).toThrow('INVALID_POST_URL'));
  it('allows optional or valid HTTPS post URL without requiring a platform account',()=>{expect(validExternalPostUrl('')).toBeNull();expect(validExternalPostUrl('https://www.tiktok.com/@owner/video/123')).toContain('/video/123');});
  it('renders readable, tappable platform controls with a separate fallback and no auto-publish',()=>{
    const item=publishingItem();const html=renderToStaticMarkup(<PublishingCard item={item} channel="YOUTUBE_SHORTS" overview={{posts:[],total:0,today:0,last7Days:0,byPlatform:{}}} busy="" act={async()=>undefined}/>);
    for(const label of ['Copiar título','Copiar legenda','Copiar hashtags','Copiar URL','Copiar post completo','Baixar vídeo MP4','Marcar como publicado'])expect(html).toContain(label);
    expect(html).toContain('READY TO POST');expect(html).not.toContain('text-overflow');expect(html).not.toContain('ellipsis');
  });
});
