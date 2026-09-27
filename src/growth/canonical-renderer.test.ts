import {describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
vi.mock('server-only',()=>({}));
vi.mock('./video-renderer',()=>({renderGrowthVideo:vi.fn(),sceneLayerSvgs:vi.fn(async()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs></defs><rect width="1080" height="1920" fill="#06131c"/></svg>';
 return {background:svg,left:svg,right:svg,center:[]};
})}));
import {renderGrowthVideo} from './video-renderer';
import {renderCanonicalStatics} from './canonical-renderer';
import {generatedContent} from './content';
import {rankedFixture} from './fixtures.test-support';
describe('canonical static assets',()=>{
 it('produces exactly one 9:16 story and one 4:5 feed PNG without voice/video work',async()=>{
  const material=generatedContent(rankedFixture()),images=await renderCanonicalStatics(material.content.masterSocial!,material.fixture);
  expect(images.map(i=>i.kind)).toEqual(['STORY_IMAGE','FEED_IMAGE']);
  for(const asset of images){const metadata=await sharp(asset.data).metadata();expect(metadata.format).toBe('png');expect(metadata.width).toBe(1080);expect(metadata.height).toBe(asset.kind==='STORY_IMAGE'?1920:1350);expect(asset.byteLength).toBeLessThan(4_000_000);}
  expect(renderGrowthVideo).not.toHaveBeenCalled();
  const again=await renderCanonicalStatics(material.content.masterSocial!,material.fixture);expect(again.map(a=>a.sha256)).toEqual(images.map(a=>a.sha256));
 });
});
