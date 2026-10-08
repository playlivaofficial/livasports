import {describe,it,expect,vi} from 'vitest';
const captureRows=vi.hoisted(()=>vi.fn());
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('@/odds/commercial-geo',async importOriginal=>({...await importOriginal<typeof import('@/odds/commercial-geo')>(),requestCommercialGeo:vi.fn(()=>null)}));
vi.mock('./runtime',()=>({loadListingMatchOdds:vi.fn(async()=>new Map())}));
vi.mock('@/components/sports/OddsComparison',()=>({OddsComparison:()=>null}));
vi.mock('./MatchRows',()=>({MatchRows:(props:{rows:Array<{home:{name:string}}>;empty:string})=>{captureRows(props);return <div data-rows>{props.rows.length?props.rows.map(row=>row.home.name).join(','):props.empty}</div>;}}));
vi.mock('./PendingMatch',()=>({PendingRows:()=>null}));
import {renderToStaticMarkup} from 'react-dom/server';
import {CompetitionPanel} from './CompetitionPanel';
import type {CompetitionHub} from './types';
import {FixtureStatus} from '@/domain/enums';
import {requestCommercialGeo} from '@/odds/commercial-geo';
import {loadListingMatchOdds} from './runtime';

vi.mock('@/localization/time-zone-server',()=>({requestTimeZone:async()=> 'UTC'}));

function hub(status:string):CompetitionHub {
  const season={id:'season',name:'2026/2027',current:true,fixtures:0};
  return {id:'competition',slug:'europa-league',name:'UEFA Europa League',country:null,countryCode:null,region:'EUROPE',type:'CUP',coverage:'SUPPORTED',season,seasons:[season],defaultSeasonId:season.id,seasonFallback:null,upcoming:[],results:[],standings:[],scorers:[],teams:[],counts:{upcoming:0,results:0},page:1,pageSize:30,providerRequests:0,availability:{SCORERS:{status,checkedAt:null}},pending:[],pendingTotal:0};
}

describe('competition source availability notices',()=>{
  it('preserves an actual reference through the competition view and uses trusted GEO independently of language',async()=>{
    const now=new Date().toISOString(),kickoff=new Date(Date.now()+3600000).toISOString();const data=hub('EMPTY');
    data.upcoming=[{id:'fixture',publicId:'bbbbbbbbbbbbbbbb',competition:'Test',competitionSlug:'europa-league',seasonId:'season',kickoff,status:FixtureStatus.SCHEDULED,round:null,stage:null,home:{id:'h',publicId:'h',name:'Home',imageUrl:null},away:{id:'a',publicId:'a',name:'Away',imageUrl:null},homeScore:null,awayScore:null}];data.counts.upcoming=1;
    vi.mocked(requestCommercialGeo).mockReturnValueOnce('PE');
    vi.mocked(loadListingMatchOdds).mockResolvedValueOnce(new Map([['fixture',{fixtureId:'fixture',fixtureStatus:'SCHEDULED',kickoff,quotes:[],eligibleBookmakers:[],destinations:{},insuranceEnabled:false,referenceQuotes:[{
      quoteId:'bwin-real-source',fixtureId:'fixture',providerFixtureId:'provider',provider:'ODDSPAPI',bookmaker:'bwin',bookmakerId:'b',bookmakerName:'bwin',providerBookmakerId:'bwin',sourceGeo:'CO',targetGeo:'PE',sourceDomain:'sports.bwin.com',geoEligible:true,
      market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION',phase:'PREGAME',decimalOdds:'1.9',status:'ACTIVE',providerUpdatedAt:now,observedAt:now,persistedAt:now,lastSuccessfulRefreshAt:now,providerKickoff:kickoff,
    }]}]]));
    renderToStaticMarkup(await CompetitionPanel({hub:data,locale:'en',tab:'fixtures'}));
    const props=captureRows.mock.calls.at(-1)![0];expect(props.commercialLocale).toBe('pe');
    expect(props.oddsViews.fixture.referenceOdds[0]).toMatchObject({bookmaker:'bwin',quoteId:'bwin-real-source',decimalOdds:'1.9',affiliateEligible:false});
    expect(props.oddsViews.fixture.odds).toEqual([]);
  });
  it.each(['co','pe'] as const)('%s keeps coverage and season explanations in Spanish with canonical links',async locale=>{
    const data={...hub('EMPTY'),seasonFallback:{id:'future',name:'2027',current:true,fixtures:0}};
    const html=renderToStaticMarkup(await CompetitionPanel({hub:data,locale,tab:'scorers'}));
    expect(html).toContain('La fuente no informa datos');expect(html).toContain('Mostrando 2026/2027');
    expect(html).not.toContain('The source');expect(html).toContain(`/${locale}/futbol?competition=europa-league`);
  });
  it.each(['EMPTY','UNAVAILABLE'])('shows real fallback scorer totals without a false %s notice',async status=>{
    const data=hub(status);
    data.scorers=[{publicId:null,name:'Recorded scorer',team:null,nationality:null,countryCode:null,goals:6,assists:null,appearances:null,minutes:null,rank:1}];
    const html=renderToStaticMarkup(await CompetitionPanel({hub:data,locale:'en',tab:'scorers'}));
    expect(html).toContain('Recorded scorer');
    expect(html).toContain('<td>6</td>');
    expect(html).not.toContain('The source reports no data');
    expect(html).not.toContain('This information is unavailable');
  });
  it.each(['EMPTY','UNAVAILABLE'])('keeps the source explanation when scorer data is truly %s',async status=>{
    const html=renderToStaticMarkup(await CompetitionPanel({hub:hub(status),locale:'en',tab:'scorers'}));
    expect(html).toContain(status==='EMPTY'?'The source reports no data':'This information is unavailable');
  });
  it('uses fixtures first with compact recent results context',async()=>{
    const data=hub('EMPTY');
    data.results=[{id:'r1',publicId:'aaaaaaaaaaaaaaaa',competition:'UEFA Europa League',competitionSlug:'europa-league',seasonId:'season',kickoff:'2026-09-10T19:00:00Z',status:FixtureStatus.FINISHED,round:'Round 1',stage:null,home:{id:'h',publicId:'h',name:'Roma',imageUrl:null},away:{id:'a',publicId:'a',name:'Porto',imageUrl:null},homeScore:2,awayScore:1}];
    data.upcoming=[{id:'u1',publicId:'bbbbbbbbbbbbbbbb',competition:'UEFA Europa League',competitionSlug:'europa-league',seasonId:'season',kickoff:'2026-09-18T19:00:00Z',status:FixtureStatus.SCHEDULED,round:'Round 2',stage:null,home:{id:'h',publicId:'h',name:'Roma',imageUrl:null},away:{id:'a',publicId:'a',name:'Porto',imageUrl:null},homeScore:null,awayScore:null}];
    data.counts={upcoming:1,results:1};
    const html=renderToStaticMarkup(await CompetitionPanel({hub:data,locale:'en',tab:'fixtures'}));
    expect(html).toContain('sports-panel-title">Recent results');
    expect(html.indexOf('sports-panel-title">Fixtures')).toBeLessThan(html.indexOf('sports-panel-title">Recent results'));
    expect(html).toContain('Roma');
    expect(html).toContain('tab=standings');
    expect(html).toContain('tab=teams');
    expect(html).toContain('tab=scorers');
    // P2 canonical links: the default season carries no ?season; a historical season keeps it on every tab link.
    expect(html).not.toContain('season=season');
    const historical=renderToStaticMarkup(await CompetitionPanel({hub:{...data,defaultSeasonId:'other-season'},locale:'en',tab:'fixtures'}));
    expect(historical).toContain('tab=standings&amp;season=season');
    expect(html).toContain('/en/football?competition=europa-league');
  });
});
