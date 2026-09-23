import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {configureGrowthFonts} from './render-fonts';
import {verifyGrowthGlyphs} from './video-renderer';

describe('serverless creative font safety',()=>{
  it('uses bundled fonts only on Linux without altering desktop font discovery',()=>{
    const env:NodeJS.ProcessEnv={NODE_ENV:'test'};configureGrowthFonts(env,'linux','/var/task');
    expect(env.FONTCONFIG_PATH).toBe(join('/var/task','public/growth/fonts'));
    expect(env.FONTCONFIG_FILE).toBe(join('/var/task','public/growth/fonts/fonts.conf'));
    const desktop:NodeJS.ProcessEnv={NODE_ENV:'test'};configureGrowthFonts(desktop,'win32');expect(desktop).toEqual({NODE_ENV:'test'});
  });
  it('ships all four real font binaries, aliases and the redistribution license',async()=>{
    for(const style of ['Regular','Bold','Italic','BoldItalic']){
      const bytes=await readFile(join(process.cwd(),`public/growth/fonts/LiberationSans-${style}.ttf`));
      expect(bytes.readUInt32BE(0)).toBe(0x00010000);expect(bytes.length).toBeGreaterThan(100_000);
    }
    expect(await readFile('public/growth/fonts/fonts.conf','utf8')).toContain('<family>Arial</family>');
    expect(await readFile('public/growth/fonts/LICENSE','utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
  it('rasterizes distinct readable glyphs rather than identical missing-character boxes',async()=>{
    await expect(verifyGrowthGlyphs()).resolves.toBeUndefined();
  });
});
