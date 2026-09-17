import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./runtime',()=>({loadCompetition:vi.fn()}));
import {loadCompetition} from './runtime';
import {footballMetadata,resolvedCompetitionView} from './metadata';
import {competitionName,competitionPath,sportsPageSize} from './policy';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import type {CompetitionHub} from './types';

const CURRENT='11111111-1111-4111-8111-111111111111',HISTORIC='22222222-2222-4222-8222-222222222222';
function hub(slug:string,overrides:Partial<CompetitionHub>={}):CompetitionHub{
  const seasons=[{id:CURRENT,name:'2026',current:true,fixtures:40},{id:HISTORIC,name:'2025',current:false,fixtures:380}];
  return {id:'c',slug,name:competitionName('br',slug)??slug,country:null,countryCode:null,region:'EUROPE',type:'LEAGUE',coverage:'SUPPORTED',seasons,season:seasons[0],defaultSeasonId:CURRENT,seasonFallback:null,
    upcoming:[],results:[],standings:[{} as CompetitionHub['standings'][number]],scorers:[],teams:[{} as CompetitionHub['teams'][number]],counts:{upcoming:40,results:70},page:1,pageSize:sportsPageSize,providerRequests:0,availability:{},pending:[],pendingTotal:0,...overrides};
}
const q=(value:Record<string,string>)=>Promise.resolve(value);
beforeEach(()=>{vi.mocked(loadCompetition).mockReset();});
const enabled=FOOTBALL_COMPETITION_TARGETS.filter(t=>t.enabled);

describe('P2 competition metadata policy',()=>{
  it.each(enabled.map(t=>t.slug))('%s: every locale self-canonicalises each tab with a reciprocal three-locale cluster',async slug=>{
    for(const locale of ['br','mx','en'] as const)for(const tab of ['fixtures','results','standings','teams'] as const){
      vi.mocked(loadCompetition).mockImplementation(async(s,l)=>hub(s,{name:competitionName(l,s)??s}));
      const metadata=await footballMetadata(locale,q({competition:slug,tab}));
      expect(metadata.robots).toEqual({index:true,follow:true});
      expect(metadata.alternates?.canonical).toBe(competitionPath(locale,slug,{tab}));
      const languages=metadata.alternates?.languages as Record<string,string>;
      expect(Object.keys(languages)).toEqual(['pt-BR','es-MX','en','x-default']);
      expect(languages['pt-BR']).toBe(competitionPath('br',slug,{tab}));expect(languages['es-MX']).toBe(competitionPath('mx',slug,{tab}));
      expect(languages.en).toBe(competitionPath('en',slug,{tab}));expect(languages['x-default']).toBe(languages.en);
      expect(Object.values(languages)).toContain(metadata.alternates?.canonical);
      expect(String(metadata.title)).toContain(competitionName(locale,slug)!);
    }
  });
  it('keeps two competitions on different canonicals and survives tracking/cosmetic parameters',async()=>{
    vi.mocked(loadCompetition).mockImplementation(async s=>hub(s));
    const a=await footballMetadata('en',q({competition:'serie-b-italy',utm_source:'x',fbclid:'y',theme:'dark',date:'2026-09-17',view:'results'}));
    const b=await footballMetadata('en',q({competition:'serie-a-italy'}));
    expect(a.alternates?.canonical).toBe('/en/football?competition=serie-b-italy');
    expect(b.alternates?.canonical).toBe('/en/football?competition=serie-a-italy');
    expect(a.robots).toEqual({index:true,follow:true});
  });
  it('omits the default season from the canonical but keeps and labels a historical season',async()=>{
    vi.mocked(loadCompetition).mockImplementation(async(s,_l,season)=>hub(s,{season:season===HISTORIC?{id:HISTORIC,name:'2025',current:false,fixtures:380}:{id:CURRENT,name:'2026',current:true,fixtures:40}}));
    const explicitCurrent=await footballMetadata('br',q({competition:'brasileirao-serie-a',season:CURRENT}));
    expect(explicitCurrent.alternates?.canonical).toBe('/br/futebol?competition=brasileirao-serie-a');
    expect(String(explicitCurrent.title)).not.toContain('2026');
    const historic=await footballMetadata('br',q({competition:'brasileirao-serie-a',season:HISTORIC,tab:'results'}));
    expect(historic.alternates?.canonical).toBe(`/br/futebol?competition=brasileirao-serie-a&tab=results&season=${HISTORIC}`);
    expect(String(historic.title)).toContain('2025');expect(String(historic.description)).toContain('2025');
    expect((historic.alternates?.languages as Record<string,string>)['x-default']).toBe(`/en/football?competition=brasileirao-serie-a&tab=results&season=${HISTORIC}`);
  });
  it('drops an unknown season id from the canonical instead of minting a new identity',async()=>{
    vi.mocked(loadCompetition).mockImplementation(async s=>hub(s));
    const metadata=await footballMetadata('mx',q({competition:'liga-mx',season:'99999999-9999-4999-8999-999999999999'}));
    expect(metadata.alternates?.canonical).toBe('/mx/futbol?competition=liga-mx');
  });
  it('paginates results with per-page canonicals and noindexes pages beyond the range',async()=>{
    vi.mocked(loadCompetition).mockImplementation(async(s,_l,_season,page)=>hub(s,{page}));
    const page2=await footballMetadata('en',q({competition:'premier-league',tab:'results',p:'2'}));
    expect(page2.alternates?.canonical).toBe('/en/football?competition=premier-league&tab=results&p=2');
    expect(page2.robots).toEqual({index:true,follow:true});expect(String(page2.title)).toContain('page 2');
    const page9=await footballMetadata('en',q({competition:'premier-league',tab:'results',p:'9'}));
    expect(page9.robots).toEqual({index:false,follow:true});
    expect(page9.alternates?.languages).toBeUndefined();
  });
  it('noindexes an empty tab but keeps an off-season hub with history indexable',async()=>{
    vi.mocked(loadCompetition).mockImplementation(async s=>hub(s,{scorers:[],counts:{upcoming:0,results:120},results:[{} as CompetitionHub['results'][number]]}));
    expect((await footballMetadata('en',q({competition:'fa-cup',tab:'scorers'}))).robots).toEqual({index:false,follow:true});
    expect((await footballMetadata('en',q({competition:'fa-cup'}))).robots).toEqual({index:true,follow:true});
    expect((await footballMetadata('en',q({competition:'fa-cup',tab:'results'}))).robots).toEqual({index:true,follow:true});
  });
  it('keeps search results, unknown competitions and transient failures out of the index',async()=>{
    vi.mocked(loadCompetition).mockImplementation(async s=>hub(s));
    expect((await footballMetadata('en',q({q:'Arsenal'}))).robots).toEqual({index:false,follow:true});
    expect((await footballMetadata('en',q({competition:'premier-league',q:'Arsenal'}))).robots).toEqual({index:false,follow:true});
    expect((await footballMetadata('en',q({competition:'not-a-league'}))).robots).toEqual({index:false,follow:false});
    vi.mocked(loadCompetition).mockRejectedValue(Error('timeout'));
    const failed=await footballMetadata('en',q({competition:'premier-league'}));
    expect(failed.robots).toEqual({index:false,follow:true});expect(failed.alternates).toBeUndefined();
    vi.mocked(loadCompetition).mockResolvedValue(null);
    expect((await footballMetadata('en',q({competition:'premier-league'}))).robots).toEqual({index:false,follow:true});
  });
  it('hub without a competition keeps the static football cluster',async()=>{
    const metadata=await footballMetadata('br',q({date:'2026-09-17',view:'results'}));
    expect(metadata.alternates?.canonical).toBe('/br/futebol');expect(loadCompetition).not.toHaveBeenCalled();
  });
  it('resolvedCompetitionView counts recent results as fixtures-tab content',()=>{
    const view=resolvedCompetitionView(hub('mls',{counts:{upcoming:0,results:9},results:Array.from({length:9},()=>({} as CompetitionHub['results'][number]))}),'fixtures',1);
    expect(view.rows).toBe(5);expect(view.pages).toBe(1);
  });
});
