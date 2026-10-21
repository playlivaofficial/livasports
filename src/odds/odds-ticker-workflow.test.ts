import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
describe('V2 scheduled cost shutdown',()=>{
 it('removes the legacy GitHub odds ticker, including manual dispatch',()=>{expect(existsSync('.github/workflows/odds-refresh.yml')).toBe(false);});
 it('has no paid-provider, growth, SEO or media cron; only bounded V3 data/editorial work is scheduled',()=>{expect(JSON.parse(readFileSync('vercel.json','utf8')).crons).toEqual([{path:'/api/internal/editorial/sports-refresh',schedule:'17 7 * * *'},{path:'/api/internal/editorial/news-cycle',schedule:'43 */6 * * *'}]);});
 it('does not hide a replacement scheduled provider call in another workflow',()=>{for(const name of readdirSync('.github/workflows')){const text=readFileSync('.github/workflows/'+name,'utf8');expect(text).not.toMatch(/api\/internal\/(odds|growth|seo|standings|authority).*refresh|^\s+schedule:/m);}});
});
