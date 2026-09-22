import {describe,expect,it} from 'vitest';
import {generateV11ContentPack} from './content';
import {rankedFixture} from './fixtures.test-support';
import {VIDEO} from './config';

describe('Traffic Engine V1.1 platform plans',()=>{
  it('creates different native copy for the same fixture and timed mute-first scene plans',()=>{
    const platforms=generateV11ContentPack(rankedFixture(),2,[rankedFixture()]).platforms!;
    expect(new Set(Object.values(platforms).map(draft=>draft.hook)).size).toBe(3);
    expect(new Set(Object.values(platforms).map(draft=>draft.script)).size).toBe(3);
    for(const draft of Object.values(platforms)){
      expect(draft.scenes).toHaveLength(5);expect(draft.scenes[0].startSeconds).toBe(0);
      expect(draft.scenes.reduce((sum,scene)=>sum+scene.durationSeconds,0)).toBeGreaterThanOrEqual(20);
      expect(draft.scenes.every(scene=>scene.subtitle.length>0&&scene.voiceover.length>0)).toBe(true);
    }
    expect(VIDEO).toMatchObject({width:1080,height:1920,subtitleTop:1320,subtitleBottom:1640});
  });
  it('preserves long names in copy without placing text below the subtitle safe zone',()=>{
    const pack=generateV11ContentPack(rankedFixture({home:{slug:'ferroviaria',name:'Associação Desportiva Ferroviária do Vale',publicId:'a'.repeat(16),imageUrl:null}}));
    expect(pack.platforms?.YOUTUBE_SHORTS.title).toContain('Associação Desportiva Ferroviária do Vale');expect(VIDEO.subtitleBottom).toBeLessThan(1700);
  });
  it('selects stable story-aware hook and CTA families without making the feed repetitive',()=>{
    const rows=Array.from({length:12},(_,index)=>rankedFixture({fixtureId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,publicId:String(index+1).padStart(16,'0')}));
    for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const){
      const drafts=rows.map(row=>generateV11ContentPack(row,1,rows).platforms![channel]);
      expect(new Set(drafts.map(draft=>draft.scenes[0].headline)).size).toBeGreaterThan(1);
      expect(new Set(drafts.map(draft=>draft.scenes[4].headline)).size).toBeGreaterThan(1);
      expect(generateV11ContentPack(rows[0],1,rows).platforms![channel]).toEqual(drafts[0]);
    }
    const copy=JSON.stringify(rows.map(row=>generateV11ContentPack(row,1,rows).platforms));
    expect(copy).not.toContain('Para tudo: olha esse jogo');expect(copy).not.toContain('Jogo em destaque');
  });
});
