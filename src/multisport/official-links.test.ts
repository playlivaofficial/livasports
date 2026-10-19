import {describe,expect,it} from 'vitest';
import globalResearch from '../../docs/v3-research-football-global.json';
import latamResearch from '../../docs/v3-research-latam.json';
import multisportResearch from '../../docs/v3-research-multisport.json';
import {competitions} from './catalog';
import {OFFICIAL_COMPETITION_LINKS,officialCompetitionLink,officialCompetitionUrl} from './official-links';

const renamed:Record<string,string>={'peru-liga1':'peru-liga-1','peru-liga2':'peru-liga-2','conmebol-libertadores':'copa-libertadores','conmebol-sudamericana':'copa-sudamericana','conmebol-recopa':'recopa-sudamericana'};
const research=[...globalResearch.records,...latamResearch,...multisportResearch];
// URLs may be standalone JSON fields or evidence embedded in a prose note.
const evidenceUrls=(value:unknown)=>new Set(JSON.stringify(value).match(/https?:[^\s"\\]+/g)??[]);

describe('audited official competition links, separate from data provenance',()=>{
 it('makes an explicit decision for every catalog ID and introduces no undocumented IDs',()=>{
  expect(Object.keys(OFFICIAL_COMPETITION_LINKS).sort()).toEqual(competitions.map(item=>item.id).sort());
  expect(Object.keys(OFFICIAL_COMPETITION_LINKS)).toHaveLength(64);
 });
 it('uses an exact URL evidenced in that competition audit, never a guessed homepage or provider endpoint',()=>{
  for(const item of competitions){
   const audited=research.find(record=>(renamed[record.id]??record.id)===item.id);expect(audited).toBeDefined();
   const url=officialCompetitionUrl(item.id);if(!url)continue;
   expect(evidenceUrls(audited).has(url),item.id).toBe(true);
   const parsed=new URL(url);expect(parsed.protocol).toBe('https:');expect(parsed.username+parsed.password+parsed.hash).toBe('');
   expect(parsed.hostname).not.toMatch(/github|football-data|openligadb|statsapi|api-live|retrosheet|cloudfront/);
   expect(parsed.pathname).not.toMatch(/\/terms|copyright|LICENSE|swagger|\/products\//i);
  }
 });
 it('returns null for unsupported identities and the two explicitly unretained official URL gaps',()=>{
  for(const id of ['unknown','__proto__','constructor','toString','NBA','https://example.com','mlb','euro-2024-archive'])expect(officialCompetitionUrl(id)).toBeNull();
  expect(Object.values(OFFICIAL_COMPETITION_LINKS).filter(value=>value===null)).toHaveLength(2);
 });
 it('keeps governing-body/directory fallbacks explicitly labelled and immutable',()=>{
  const expected=['atp-finals','atp-masters-1000','campeon-de-campeones','copa-bicentenario','wta-1000'];
  expect(Object.entries(OFFICIAL_COMPETITION_LINKS).filter(([,link])=>link?.scope==='governing-body').map(([id])=>id).sort()).toEqual(expected);
  expect(Object.isFrozen(OFFICIAL_COMPETITION_LINKS)).toBe(true);
  for(const link of Object.values(OFFICIAL_COMPETITION_LINKS))if(link)expect(Object.isFrozen(link)).toBe(true);
  expect(officialCompetitionLink('copa-bicentenario')?.url).not.toBe(officialCompetitionUrl('peru-copa-de-la-liga'));
 });
 it('does not change catalog source provenance while replacing misleading provider CTAs',()=>{
  const premier=competitions.find(item=>item.id==='premier-league')!;
  expect(premier.sourceUrl).toContain('raw.githubusercontent.com/openfootball/');
  expect(officialCompetitionUrl(premier.id)).toContain('www.premierleague.com/');
  const champions=competitions.find(item=>item.id==='champions-league')!;
  expect(champions.sourceUrl).toBe('https://www.football-data.org/coverage');
  expect(officialCompetitionUrl(champions.id)).toContain('www.uefa.com/uefachampionsleague/');
 });
 it('preserves audited edition statuses; official links do not turn historical or unverified cups into active competitions',()=>{
  for(const item of competitions){
   const audited=research.find(record=>(renamed[record.id]??record.id)===item.id)!;
   expect({status:item.status,season:item.season,officialName:item.officialName},item.id).toEqual({status:audited.status,season:audited.season,officialName:audited.officialName});
  }
  for(const [id,status] of Object.entries({'copa-mx':'historical','copa-bicentenario':'historical','peru-supercopa':'unverified','peru-copa-de-la-liga':'active',nba:'upcoming','wta-1000':'unverified','recopa-sudamericana':'completed','concacaf-champions-cup':'completed'}))expect(competitions.find(item=>item.id===id)?.status).toBe(status);
 });
});
