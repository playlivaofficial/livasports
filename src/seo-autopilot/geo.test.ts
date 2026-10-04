import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const shared=vi.hoisted(()=>({rank:vi.fn()}));
vi.mock('@/growth/service',()=>({rankGrowthInventory:shared.rank}));
import {CORE_GEOS,geoProfile} from '@/config/geo';
import type {DatabaseClient} from '@/database/client';
import {scoreFixture} from '@/growth/scoring';
import {testSignals,testNow} from '@/growth/fixtures.test-support';
import {matchPath} from '@/localization/interface';
import {readSeoInventory} from './repository';
import {seoInternalLinkEngine,seoOpportunityScore} from './policy';
import {queryIntent,actionGate,type GrowthPage} from './optimization-policy';
import {readFileSync} from 'node:fs';

beforeEach(()=>vi.clearAllMocks());
describe('one shared priority signal and isolated GEO SEO state',()=>{
  it.each(CORE_GEOS)('%s uses the exact shared ranking, not another set of SEO weights',async geo=>{
    const locale=geoProfile(geo).locale as 'mx'|'co'|'pe',signals=testSignals(),priority=scoreFixture(signals,testNow,{geo,intentStrength:.7,searchStrength:.5});
    const destinationPath=matchPath(locale,signals.publicId,signals.home.name,signals.away.name),destinationUrl='https://livasports.com'+destinationPath;
    shared.rank.mockResolvedValue([{signals,priority,destinationPath,destinationUrl,odds:{count:2,bookmakers:[],label:'Verified'}}]);
    const query=vi.fn(async(sql:string)=>{
      if(sql.startsWith('SELECT f.*,c.slug'))return {rows:[{id:signals.fixtureId,public_id:signals.publicId,kickoff:signals.kickoff,status:signals.status,competition_slug:signals.competitionSlug,competition_name:signals.competitionName,competition_type:'LEAGUE',home_name:signals.home.name,away_name:signals.away.name,home_public_id:signals.home.publicId,away_public_id:signals.away.publicId}]};
      if(sql.startsWith('SELECT f.id,f.updated_at'))return {rows:[{id:signals.fixtureId,updated_at:testNow,shortlisted:true,results:[]}]};
      if(sql.includes('FROM seo_search_daily'))return {rows:[{key:destinationUrl,clicks:2,impressions:100,ctr:.02,position:12},{key:destinationUrl.replace('/'+locale+'/', '/br/'),clicks:900,impressions:9000,ctr:.1,position:1}]};
      return {rows:[]};
    });
    const db={query} as unknown as DatabaseClient,candidates=await readSeoInventory(db,testNow,geo);
    expect(shared.rank).toHaveBeenCalledWith(db,testNow,geo);expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({locale,geo,destinationUrl,score:{total:priority.total},evidence:{clicks:2,impressions:100}});
    expect(seoOpportunityScore(signals,candidates[0].evidence,testNow).components.map(c=>c.points)).toEqual(priority.lines.map(l=>l.points));
    const sql=query.mock.calls.map(c=>c[0]).join('\n');
    expect(sql).toContain('ap.locale=$2');expect(sql).toContain('gp.geo=$3');expect(sql).toContain('f.id=ANY($6::uuid[])');
    expect(sql).toContain('WHERE locale=$1');
    expect(seoInternalLinkEngine(signals,[],locale).every(link=>link.href.startsWith('/'+locale+'/'))).toBe(true);
  });
  it('keeps the V2.1 safety gates but stops new BR optimization',()=>{
    const base={managed:true,fresh:true,technicalHealthy:true,activeExperiment:false,lastChangedAt:null,publishedAt:'2026-01-01',current:{days:28,impressions:1000},coverageDays:28} as GrowthPage;
    for(const locale of ['br','en'])expect(actionGate({...base,locale},'TITLE_PATTERN','HIGH',testNow,0,'ACTIVE')).not.toBe('ELIGIBLE');
    for(const locale of ['mx','co','pe'])expect(actionGate({...base,locale},'TITLE_PATTERN','HIGH',testNow,0,'ACTIVE')).toBe('ELIGIBLE');
    expect(actionGate({...base,locale:'co'},'TITLE_PATTERN','HIGH',testNow,1,'ACTIVE')).toBe('DAILY_CAP');
  });
  it('recognizes real Spanish search intents without creating intent URLs',()=>{
    expect(queryIntent('historial América Toluca')).toBe('H2H');expect(queryIntent('clasificación Liga BetPlay')).toBe('STANDINGS');
    expect(queryIntent('cuándo juega Universitario')).toBe('SCHEDULE');expect(queryIntent('últimos resultados Alianza')).toBe('FORM');
  });
  it('adds isolated core tables while keeping old production conflict keys and BR history untouched',()=>{
    const sql=readFileSync('db/migrations/059_geo_seo.sql','utf8');
    expect(sql).toContain('PRIMARY KEY(fixture_id,locale)');expect(sql.match(/PRIMARY KEY\(locale,cluster\)/g)).toHaveLength(2);
    for(const table of ['seo_geo_pages','seo_geo_clusters','seo_geo_cluster_weights'])expect(sql).toContain('CREATE TABLE IF NOT EXISTS '+table);
    for(const table of ['seo_autopilot_pages','seo_autopilot_clusters','seo_growth_cluster_weights']){
      expect(sql).toContain('FROM '+table);
      expect(sql).not.toMatch(new RegExp('(?:ALTER TABLE|UPDATE|INSERT INTO|DELETE FROM) '+table+'\\b','i'));
    }
    expect(sql.match(/UNION ALL/g)).toHaveLength(3);
    expect(sql).toContain("CHECK(locale IN('mx','co','pe'))");
    expect(sql).toContain("CHECK(url LIKE 'https://livasports.com/' || locale || '/partido/%')");
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE fixtures|UPDATE users/i);
    for(const file of ['public.tsx','report.ts','optimization-data.ts'])expect(readFileSync(new URL(file,import.meta.url),'utf8')).toContain('FROM seo_all_pages');
    expect(readFileSync('src/sports/sitemap-repository.ts','utf8')).toContain('FROM seo_all_pages');
  });
  it('new optimizer/publisher code has no write path to legacy or union page/cluster state',()=>{
    for(const file of ['service.ts','feedback.ts','optimization.ts']){
      const source=readFileSync(new URL(file,import.meta.url),'utf8');
      expect(source).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) (?:seo_autopilot_pages|seo_autopilot_clusters|seo_growth_cluster_weights|seo_all_pages|seo_all_clusters|seo_all_cluster_weights)\b/);
    }
  });
});
