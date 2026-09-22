import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {generateV11ContentPack,fixtureSnapshot} from './content';
import {rankedFixture} from './fixtures.test-support';
import {renderGrowthVideo,renderGrowthVideos} from './video-renderer';

describe('Traffic Engine V1.1 MP4 renderer',()=>{
  it('renders a deterministic multi-scene H.264-compatible MP4 without remote media',async()=>{
    const row=rankedFixture({home:{slug:'flamengo',name:'Clube de Regatas do Flamengo',publicId:'a'.repeat(16),imageUrl:null},away:{slug:'corinthians',name:'Sport Club Corinthians Paulista',publicId:'b'.repeat(16),imageUrl:null}});
    const draft=generateV11ContentPack(row,1,[row]).platforms!.TIKTOK;
    const rendered=await renderGrowthVideo(draft,fixtureSnapshot(row),{assetLoader:async()=>null});
    expect(rendered.mimeType).toBe('video/mp4');expect(rendered.byteLength).toBeGreaterThan(20_000);expect(rendered.byteLength).toBeLessThan(8_000_000);
    expect(rendered.data.subarray(4,8).toString()).toBe('ftyp');expect(rendered.sha256).toMatch(/^[a-f0-9]{64}$/);
    const repeated=await renderGrowthVideo(draft,fixtureSnapshot(row),{assetLoader:async()=>null});expect(repeated.sha256).toBe(rendered.sha256);
  },120_000);
  it('renders all platform outputs through the bounded-memory batch path',async()=>{
    const row=rankedFixture(),pack=generateV11ContentPack(row,1,[row]),rendered=await renderGrowthVideos(pack.platforms!,fixtureSnapshot(row),{assetLoader:async()=>null});
    expect(rendered).toHaveLength(3);expect(rendered.map(item=>item.channel)).toEqual(['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS']);
    expect(rendered.every(item=>item.status==='READY'&&item.byteLength>20_000)).toBe(true);
  },120_000);
});
