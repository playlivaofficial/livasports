import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
vi.mock('server-only',()=>({}));
vi.mock('./video-renderer',()=>({growthSceneSvg:vi.fn(),sceneLayerSvgs:vi.fn(async()=>({background:'<svg><defs></defs></svg>',left:'<svg><defs></defs></svg>',right:'<svg><defs></defs></svg>',center:[]})),renderGrowthVideo:vi.fn(),remoteAsset:vi.fn(async()=>null)}));
import {growthSceneSvg,renderGrowthVideo} from './video-renderer';
import {renderSocialPackage} from './social-renderer';
import {generatedContent} from './content';
import {rankedFixture,testNow} from './fixtures.test-support';
import {VIDEO_CHANNELS} from './config';
import {socialDraftIdentity} from './socialCompliance';
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(growthSceneSvg).mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><text x="20" y="100">Análise do confronto</text></svg>');
  vi.mocked(renderGrowthVideo).mockImplementation(async draft=>{
    const data=Buffer.from(`test-video-${draft.channel}`);
    return {channel:draft.channel,status:'READY',mimeType:'video/mp4',data,byteLength:data.length,sha256:createHash('sha256').update(data).digest('hex'),renderMetadata:{voice:{mode:'EDITORIAL',provider:'test',lines:draft.scenes.length,degradedReason:null},characterMode:'NONE',scenery:[],durationSeconds:20,renderMs:1,sceneTiming:[]}};
  });
});
describe('platform package orchestration',()=>{
  const g=()=>generatedContent(rankedFixture(),1,[],testNow);
  it('encodes exactly one master and two statics, binding three policy profiles to identical media',async()=>{
    const m=g(),result=await renderSocialPackage(m.content.platforms!,m.fixture);
    expect(result.map(v=>v.kind)).toEqual(['MASTER_VIDEO','STORY_IMAGE','FEED_IMAGE']);
    const [video,cover,feed]=result;
    for(const channel of VIDEO_CHANNELS){const proof=video.renderMetadata!.socialProofs![channel]!;
      expect(proof.draftIdentity).toBe(socialDraftIdentity(m.content.platforms![channel]));
      expect(proof.videoSha256).toBe(video.sha256);expect(proof.coverSha256).toBe(cover.sha256);expect(proof.feedSha256).toBe(feed.sha256);
    }
    expect(await sharp(cover.data).metadata()).toMatchObject({width:1080,height:1920,format:'png'});
    expect(await sharp(feed.data).metadata()).toMatchObject({width:1080,height:1350,format:'png'});
    expect(renderGrowthVideo).toHaveBeenCalledTimes(1);
    for(const call of vi.mocked(renderGrowthVideo).mock.calls)expect(call[2]).toMatchObject({requireNarration:true,master:true});
  });
  it('checks all drafts before any narration or rendering',async()=>{
    const m=g();m.content.platforms!.YOUTUBE_SHORTS.social!.metadata={operator:'Betsson'};
    await expect(renderSocialPackage(m.content.platforms!,m.fixture)).rejects.toThrow('SOCIAL_BLOCKED_FOR_REVIEW');
    expect(renderGrowthVideo).not.toHaveBeenCalled();expect(growthSceneSvg).not.toHaveBeenCalled();
  });
  it('rejects divergent media scripts before spending narration credits',async()=>{
    const m=g();m.content.platforms!.TIKTOK.scenes[0].voiceover='Outra análise esportiva.';
    await expect(renderSocialPackage(m.content.platforms!,m.fixture)).rejects.toThrow('SOCIAL_MASTER_MISMATCH');
    expect(renderGrowthVideo).not.toHaveBeenCalled();
  });
  it('blocks hardcoded renderer language even if the stored caption is safe',async()=>{
    const m=g();vi.mocked(growthSceneSvg).mockResolvedValue('<svg><text>COMPARE AS ODDS</text></svg>');
    await expect(renderSocialPackage(m.content.platforms!,m.fixture)).rejects.toThrow('SOCIAL_RENDER_BLOCKED_FOR_REVIEW');
    expect(renderGrowthVideo).not.toHaveBeenCalled();
  });
  it('returns no partial package or generic fallback after a voice failure',async()=>{
    const m=g();vi.mocked(renderGrowthVideo).mockRejectedValueOnce(Error('NARRATION_INCOMPLETE_KEEP_PREDECESSOR'));
    await expect(renderSocialPackage(m.content.platforms!,m.fixture)).rejects.toThrow('NARRATION_INCOMPLETE_KEEP_PREDECESSOR');
    expect(renderGrowthVideo).toHaveBeenCalledTimes(1);
  });
});
