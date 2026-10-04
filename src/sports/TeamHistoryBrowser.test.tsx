import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TeamHistoryBrowser} from './TeamHistoryBrowser';
import type {SportsFixture} from './types';
import {FixtureStatus} from '@/domain/enums';

vi.mock('@/favorites/FavoriteButton',()=>({FavoriteButton:()=>null}));
vi.mock('@/localization/LocalizedTime',()=>({useTimeZone:()=> 'America/Mexico_City'}));
const fixture:SportsFixture={id:'fixture',publicId:'1111111111111111',competition:'Liga MX',competitionSlug:'liga-mx',seasonId:null,
  kickoff:'2026-10-01T18:00:00Z',status:FixtureStatus.FINISHED,round:null,stage:null,
  home:{id:'home',publicId:'2222222222222222',name:'Home team',imageUrl:null},away:{id:'away',publicId:'3333333333333333',name:'Away team',imageUrl:null},homeScore:2,awayScore:1};

describe('cacheable team history shell',()=>{
  it('renders complete crawlable default results and canonical fixture links before hydration',()=>{
    const html=renderToStaticMarkup(<TeamHistoryBrowser locale="mx" profile={{publicId:'4444444444444444',name:'Team',competitions:[]}} initial={{rows:[fixture],hasNext:true}}/>);
    expect(html).toContain('Home team');expect(html).toContain('Away team');expect(html).toContain('/mx/partido/home-team-x-away-team-1111111111111111');
    expect(html).toContain('<b>2</b><b>1</b>');expect(html).toContain('12:00');expect(html).toContain('matches=results&amp;p=2#matches');expect(html).not.toContain('aria-busy="true"');
  });
  it('keeps an honest unavailable state without fabricated rows',()=>{
    const html=renderToStaticMarkup(<TeamHistoryBrowser locale="en" profile={{publicId:'4444444444444444',name:'Team',competitions:[]}} initial={{rows:[],hasNext:false}} failed/>);
    expect(html).toContain('Could not load sports data. Please try again.');expect(html).not.toContain('Home team');
  });
});
