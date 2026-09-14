import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('@/odds/commercial-geo',()=>({requestCommercialGeo:()=>null}));
vi.mock('./runtime',()=>({loadListingMatchOdds:async()=>new Map()}));
vi.mock('@/components/sports/OddsComparison',()=>({OddsComparison:()=>null}));
vi.mock('./MatchRows',()=>({MatchRows:({rows,empty}:{rows:Array<{home:{name:string}}>;empty:string})=> <div data-rows>{rows.length?rows.map(row=>row.home.name).join(','):empty}</div>}));
vi.mock('./PendingMatch',()=>({PendingRows:()=>null}));
import {renderToStaticMarkup} from 'react-dom/server';
import {CompetitionPanel} from './CompetitionPanel';
import type {CompetitionHub} from './types';
import {FixtureStatus} from '@/domain/enums';

vi.mock('@/localization/time-zone-server',()=>({requestTimeZone:async()=> 'UTC'}));

function hub(status:string):CompetitionHub {
  const season={id:'season',name:'2026/2027',current:true,fixtures:0};
  return {id:'competition',slug:'europa-league',name:'UEFA Europa League',country:'Europe',type:'CUP',coverage:'SUPPORTED',season,seasons:[season],seasonFallback:null,upcoming:[],results:[],standings:[],scorers:[],teams:[],counts:{upcoming:0,results:0},page:1,pageSize:30,providerRequests:0,availability:{SCORERS:{status,checkedAt:null}},pending:[],pendingTotal:0};
}

describe('competition source availability notices',()=>{
  it.each(['EMPTY','UNAVAILABLE'])('shows real fallback scorer totals without a false %s notice',async status=>{
    const data=hub(status);
    data.scorers=[{publicId:null,name:'Recorded scorer',team:null,goals:6,assists:null,appearances:null,minutes:null,rank:1}];
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
  it('defaults the hub to recent results then upcoming matches',async()=>{
    const data=hub('EMPTY');
    data.results=[{id:'r1',publicId:'aaaaaaaaaaaaaaaa',competition:'UEFA Europa League',competitionSlug:'europa-league',seasonId:'season',kickoff:'2026-09-10T19:00:00Z',status:FixtureStatus.FINISHED,round:'Round 1',stage:null,home:{id:'h',publicId:'h',name:'Roma',imageUrl:null},away:{id:'a',publicId:'a',name:'Porto',imageUrl:null},homeScore:2,awayScore:1}];
    data.upcoming=[{id:'u1',publicId:'bbbbbbbbbbbbbbbb',competition:'UEFA Europa League',competitionSlug:'europa-league',seasonId:'season',kickoff:'2026-09-18T19:00:00Z',status:FixtureStatus.SCHEDULED,round:'Round 2',stage:null,home:{id:'h',publicId:'h',name:'Roma',imageUrl:null},away:{id:'a',publicId:'a',name:'Porto',imageUrl:null},homeScore:null,awayScore:null}];
    data.counts={upcoming:1,results:1};
    const html=renderToStaticMarkup(await CompetitionPanel({hub:data,locale:'en',tab:'overview'}));
    expect(html).toContain('sports-panel-title">Recent results');
    expect(html).toContain('sports-panel-title">Upcoming matches');
    expect(html.indexOf('sports-panel-title">Recent results')).toBeLessThan(html.indexOf('sports-panel-title">Upcoming matches'));
    expect(html).toContain('Roma');
    expect(html).toContain('tab=standings');
    expect(html).toContain('tab=teams');
    expect(html).toContain('tab=scorers');
    expect(html).toContain('season=season');
    expect(html).toContain('/en/football?competition=europa-league');
  });
});
