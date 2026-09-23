import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
vi.mock('server-only',()=>({}));
import {CHARACTER_IDENTITIES,CHARACTER_POSES,characterAssetPath,clashPoses} from './characters';
import {loadCharacterArt} from './character-art';
import {teamPalette} from './palette';
import {generateV11ContentPack,fixtureSnapshot} from './content';
import {rankedFixture} from './fixtures.test-support';
import {growthSceneSvg} from './video-renderer';
import {PROMO_VARIANTS,playLivaPromoSvg} from './promo';

describe('approved premium creative assets and fallback',()=>{
  it('ships both approved identities in all five poses, retaining source transparency',async()=>{
    for(const identity of CHARACTER_IDENTITIES)for(const pose of CHARACTER_POSES){
      const image=sharp(await readFile(join(process.cwd(),'public',characterAssetPath(identity,pose))));
      expect(await image.metadata()).toMatchObject({width:1024,height:1536,hasAlpha:true});
    }
    expect(new Set(Array.from({length:40},(_,i)=>clashPoses(String(i)).join(':'))).size).toBeGreaterThan(3);
  });
  it('changes fabric colours while leaving skin and alpha identical',async()=>{
    const palette=teamPalette('flamengo');
    const rendered=await loadCharacterArt('curly','READY',palette);expect(rendered).toBeTruthy();
    const original=await sharp(await readFile(join(process.cwd(),'public',characterAssetPath('curly','READY')))).resize(600,900).ensureAlpha().raw().toBuffer();
    const tinted=await sharp(Buffer.from(rendered!.split(',')[1],'base64')).raw().toBuffer();
    let changed=0,skin=0,alphaMismatches=0,skinMismatches=0;
    for(let i=0;i<original.length;i+=4){if(tinted[i+3]!==original[i+3])alphaMismatches++;
      if(original[i]>original[i+1]*1.2&&original[i+1]>original[i+2]&&original[i+3]>230){skin++;if(!tinted.subarray(i,i+3).equals(original.subarray(i,i+3)))skinMismatches++;}
      if(tinted[i]!==original[i])changed++;
    }
    expect(skin).toBeGreaterThan(1000);expect(changed).toBeGreaterThan(1000);expect(alphaMismatches).toBe(0);expect(skinMismatches).toBe(0);
  });
  it('retains readable club identity when approved character art is unavailable',async()=>{
    const row=rankedFixture(),draft=generateV11ContentPack(row,1,[row]).platforms!.TIKTOK;
    const svg=await growthSceneSvg(draft.scenes[0],fixtureSnapshot(row),draft,{assetLoader:async()=>null,characterLoader:async()=>null,sceneryLoader:async()=>null});
    expect(svg).not.toContain('data-liva-character');expect(svg).toContain(row.signals.home.name);
    expect(svg).toContain('LivaSports</tspan>');expect(svg).toContain('>.com</tspan>');
  });
  it('uses each CTA and hook family at most once in a five-fixture same-angle feed',()=>{
    const rows=Array.from({length:5},(_,i)=>rankedFixture({fixtureId:`fixture-${i}`}));
    const packs=rows.map((row,i)=>generateV11ContentPack(row,i+1,[row]));
    for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const){
      expect(new Set(packs.map(pack=>pack.platforms![channel].creative!.hookFamily)).size).toBe(5);
      expect(new Set(packs.map(pack=>pack.platforms![channel].creative!.ctaFamily)).size).toBe(5);
    }
    expect(generateV11ContentPack(rows[0],1,[rows[0]])).toEqual(generateV11ContentPack(rows[0],1,[rows[0]]));
  });
  it('keeps all three PlayLiva end cards branded without bookmaker claims',()=>{
    const variants=PROMO_VARIANTS.map(playLivaPromoSvg);expect(new Set(variants).size).toBe(3);
    for(const svg of variants){expect(svg).toContain('PlayLiva</tspan>');expect(svg).toContain('>.com</tspan>');expect(svg).not.toMatch(/betano|betsson|betboo|bonus|bônus|ganhe/i);}
  });
  it('uses compact whole club labels and editorial odds without fake app buttons',async()=>{
    const row=rankedFixture({away:{slug:'athletic-club',name:'Athletic Club',publicId:'b'.repeat(16),imageUrl:null}});
    const pack=generateV11ContentPack(row),options={assetLoader:async()=>null,characterLoader:async()=>null,sceneryLoader:async()=>null};
    for(const draft of Object.values(pack.platforms!)){
      const hook=await growthSceneSvg(draft.scenes[0],fixtureSnapshot(row),draft,options);
      expect(hook).toContain('>Athletic Club</text>');
      const odds=await growthSceneSvg(draft.scenes.find(scene=>scene.visual==='ODDS')!,fixtureSnapshot(row),draft,options);
      expect(odds).toContain('MESMO JOGO. MESMO MERCADO.');expect(odds).not.toContain('VER PREÇOS →');
    }
  });
  it('rotates away from recent same-team choices without changing the acquisition score',()=>{
    const row=rankedFixture(),first=generateV11ContentPack(row,1,[row]);
    const enriched={...row,creativeHistory:Object.values(first.platforms!).map(draft=>({channel:draft.channel,creative:draft.creative!}))};
    const second=generateV11ContentPack(enriched,1,[enriched]);
    for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const){
      expect(second.platforms![channel].creative!.hookFamily).not.toBe(first.platforms![channel].creative!.hookFamily);
      expect(second.platforms![channel].creative!.ctaFamily).not.toBe(first.platforms![channel].creative!.ctaFamily);
    }
    expect(second.seo).toEqual(first.seo);expect(generateV11ContentPack(enriched,1,[enriched])).toEqual(second);
  });
  it('uses both original characters and crest-led treatments across the feed',()=>{
    const modes=new Set<string>(),assignments=new Set<string>();
    for(let rank=1;rank<=6;rank++){
      const draft=generateV11ContentPack(rankedFixture(),rank).platforms!.TIKTOK;
      modes.add(draft.creative!.characters);assignments.add(draft.creative!.identities!.join());
    }
    expect(modes).toEqual(new Set(['LIVA_ORIGINAL','NONE']));expect(assignments.size).toBe(2);
    expect(clashPoses('fixture:TIKTOK')).not.toEqual(clashPoses('fixture:INSTAGRAM_REELS'));
  });
  it('keeps long single-word team names intact and makes CTA compositions different',async()=>{
    const row=rankedFixture({home:{slug:'novorizontino',name:'Novorizontino',publicId:'a'.repeat(16),imageUrl:null}}),pack=generateV11ContentPack(row);
    const svgs=[];
    for(const draft of Object.values(pack.platforms!)){
      const options={assetLoader:async()=>null,characterLoader:async()=>null,sceneryLoader:async()=>null};
      const hook=await growthSceneSvg(draft.scenes[0],fixtureSnapshot(row),draft,options);
      expect(hook).toContain('>Novorizontino</text>');expect(hook).not.toMatch(/…|\.\.\./);
      svgs.push(await growthSceneSvg(draft.scenes[4],fixtureSnapshot(row),draft,options));
    }
    expect(svgs[0]).toContain('rotate(-3)');expect(svgs[1]).toContain('O JOGO CONTINUA');expect(svgs[2]).toContain('DADOS DO CONFRONTO');
  });
});
