import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
describe('V2 scheduled cost shutdown',()=>{
 it('removes the legacy GitHub odds ticker, including manual dispatch',()=>{expect(existsSync('.github/workflows/odds-refresh.yml')).toBe(false);});
 it('has no Vercel sports, growth, SEO or social cron',()=>{expect(JSON.parse(readFileSync('vercel.json','utf8')).crons).toEqual([]);});
 it('does not hide a replacement scheduled provider call in another workflow',()=>{for(const name of readdirSync('.github/workflows')){const text=readFileSync('.github/workflows/'+name,'utf8');expect(text).not.toMatch(/api\/internal\/(odds|growth|seo|standings|authority).*refresh|^\s+schedule:/m);}});
});
