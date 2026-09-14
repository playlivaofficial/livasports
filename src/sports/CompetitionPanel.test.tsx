import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CompetitionPanel} from './CompetitionPanel';
import type {CompetitionHub} from './types';

vi.mock('@/localization/time-zone-server',()=>({requestTimeZone:async()=> 'UTC'}));

function hub(status:string):CompetitionHub {
  const season={id:'season',name:'2026/2027',current:true,fixtures:0};
  return {id:'competition',slug:'europa-league',name:'UEFA Europa League',country:'Europe',type:'CUP',coverage:'SUPPORTED',season,seasons:[season],seasonFallback:null,upcoming:[],results:[],standings:[],scorers:[],teams:[],counts:{upcoming:0,results:0},page:1,pageSize:30,providerRequests:0,availability:{SCORERS:{status,checkedAt:null}},pending:[],pendingTotal:0};
}

describe('competition source availability notices',()=>{
  it.each(['EMPTY','UNAVAILABLE'])('shows real fallback scorer totals without a false %s notice',async status=>{
    const data=hub(status);
    data.scorers=[{publicId:null,name:'Recorded scorer',team:null,goals:6,assists:null,appearances:null,minutes:null,rank:1}];
    const html=renderToStaticMarkup(await CompetitionPanel({hub:data,locale:'en',tab:'scorers',legacyOverview:false}));
    expect(html).toContain('Recorded scorer');
    expect(html).toContain('<td>6</td>');
    expect(html).not.toContain('The source reports no data');
    expect(html).not.toContain('This information is unavailable');
  });
  it.each(['EMPTY','UNAVAILABLE'])('keeps the source explanation when scorer data is truly %s',async status=>{
    const html=renderToStaticMarkup(await CompetitionPanel({hub:hub(status),locale:'en',tab:'scorers',legacyOverview:false}));
    expect(html).toContain(status==='EMPTY'?'The source reports no data':'This information is unavailable');
  });
});
