import {describe,it,expect,vi} from 'vitest';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
vi.mock('server-only',()=>({}));
const {query,close}=vi.hoisted(()=>({query:vi.fn(),close:vi.fn()}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class {query=query;close=close;}}));
import {readPriorityLinks} from './prominence-read';
import {PostgresFootballRepository} from '@/repositories/postgres-football.repository';
import type {QueryExecutor} from '@/database/client';

const row=(over:Record<string,unknown>={})=>({fixture_id:'f',priority_rank:1,priority_score:80,canonical_url:'https://livasports.com/co/partido/sao-paulo-x-santos-0123456789abcdef',
  context_localized:'Context',competition:'Brasileirão Série A',competition_slug:'brasileirao-serie-a',kickoff:'2026-10-01T20:00:00Z',home:'São Paulo',away:'Santos',
  home_public_id:'1111111111111111',away_public_id:'2222222222222222',...over});

/**
 * The Growth Engine still selects an independent Top 5 per GEO. What was retired is only its separate
 * public "Matches to follow" box; those fixtures are now marked inside the real fixture listing.
 */
describe('GEO Growth Top 5 read',()=>{
  it('reads the GEO\'s own active Top 5, scheduled and upcoming, in rank order',async()=>{
    query.mockResolvedValue({rows:[row()]});
    const rows=await readPriorityLinks({kind:'HOME'},'CO');
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({rank:1,home:'São Paulo',competitionSlug:'brasileirao-serie-a'});
    const [sql,values]=query.mock.calls.at(-1)!;
    expect(sql).toContain('ORDER BY p.priority_rank LIMIT 5');expect(sql).toContain("f.status='SCHEDULED'");expect(sql).toContain('f.kickoff>now()');
    expect(values).toEqual(['HOME','CO']);
  });
  it('drops a canonical URL that belongs to another GEO',async()=>{
    query.mockResolvedValue({rows:[row({canonical_url:'https://livasports.com/co/partido/a'})]});
    expect(await readPriorityLinks({kind:'HOME'},'MX')).toEqual([]);
  });
  it.each(['MX','CO','PE'] as const)('keeps %s isolated: the query is scoped to that GEO only',async geo=>{
    query.mockResolvedValue({rows:[]});await readPriorityLinks({kind:'HOME'},geo);
    expect(query.mock.calls.at(-1)![1]).toEqual(['HOME',geo]);
  });
});

describe('Growth Top 5 inside the real fixture listing',()=>{
  it('attaches each Top 5 rank to its fixture and leads with its competition',async()=>{
    const fixture=(id:string,slug:string)=>({id,public_id:'0123456789abcdef',sport_id:'s',competition_id:'c',season_id:null,home_team_id:'h',away_team_id:'a',
      kickoff:'2026-10-10T20:00:00Z',status:'SCHEDULED',home_score:null,away_score:null,created_at:'2026-10-01',updated_at:'2026-10-01',provider_updated_at:null,
      competition_name:slug,competition_slug:slug,competition_group:'EUROPE',competition_priority:50,home_team_name:'H',home_team_short_name:null,home_team_image_url:null,
      away_team_name:'A',away_team_short_name:null,away_team_image_url:null});
    const db={query:vi.fn(async(sql:string)=>sql.includes('growth_geo_priorities')
      ?{rows:[{fixture_id:'ranked',priority_rank:2}]}
      :{rows:[fixture('plain','premier-league'),fixture('ranked','la-liga')]})} as unknown as QueryExecutor;
    const records=await new PostgresFootballRepository(db as never).listFixtures('CO',new Date('2026-10-08'),new Date('2026-10-15'));
    const ranked=records.find(r=>r.fixture.id==='ranked')!,plain=records.find(r=>r.fixture.id==='plain')!;
    expect(ranked.growthRank).toBe(2);expect(plain.growthRank).toBeUndefined();
    expect(ranked.competitionPriority!).toBeLessThan(plain.competitionPriority!);
  });
});

/** Regression guard: the retired public box must not come back on any GEO, language or surface. */
const SRC=join(process.cwd(),'src');
function sources(dir:string):string[]{return readdirSync(dir).flatMap(name=>{const p=join(dir,name);
  return statSync(p).isDirectory()?sources(p):/\.(tsx?|css)$/.test(name)&&!/\.test\.tsx?$/.test(name)?[p]:[];});}
describe('retired public "Matches to follow" box',()=>{
  it('has no rendering component left',()=>{
    expect(existsSync(join(SRC,'growth','GrowthProminence.tsx'))).toBe(false);
    expect(existsSync(join(SRC,'growth','GrowthExperience.tsx'))).toBe(false);
  });
  it('is not rendered or imported by any public surface in any language',()=>{
    const offenders=sources(SRC).filter(file=>!file.includes(join('src','owner'))).filter(file=>{
      const text=readFileSync(file,'utf8');
      return /GrowthProminence|GrowthExperience|GrowthCards|growth-prominence-item/.test(text)||
        /Matches to follow|Partidos para seguir|Jogos para acompanhar/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
