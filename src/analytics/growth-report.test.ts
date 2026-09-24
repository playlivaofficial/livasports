import {describe,expect,it} from 'vitest';
import {delta,funnelSteps,pickWinners,previousPeriod,scoreRows,weekStart,searchConsole,socialNativeSources,SCORECARD_RULES,type PeriodMetrics,type RankedEntity} from './growth-report';
import {parseGrowthQuery,growthQueryString,withoutRange,MAX_RANGE_DAYS} from './growth-filters';
import {csvCell,toCsv} from './growth-csv';

const metrics=(over:Partial<PeriodMetrics>={}):PeriodMetrics=>({sessions:0,organicSessions:0,socialSessions:0,matchViews:0,oddsInteractions:0,slipAdds:0,slipsCreated:0,slipsOpened:0,
  comparisonSessions:0,ctaClicks:0,outboundRedirects:0,clickSessions:0,bookmakerCtr:0,...over});
const row=(key:string,sessions:number,clicks:number,ctr:number,slipAdds=0):RankedEntity=>({key,label:key,sessions,matchViews:0,slipAdds,clicks,ctr});

describe('growth dashboard maths',()=>{
  it('compares against the equivalent previous period',()=>{
    const from=new Date('2026-09-17T03:00:00Z'),to=new Date('2026-09-24T03:00:00Z'),prev=previousPeriod(from,to);
    expect(prev.to).toEqual(from);expect(prev.from.toISOString()).toBe('2026-09-10T03:00:00.000Z');
    expect(delta('sessions',metrics({sessions:150}),metrics({sessions:100}))).toMatchObject({change:50,changePct:50});
    // No percentage against a zero base: "new", never infinity.
    expect(delta('sessions',metrics({sessions:5}),metrics()).changePct).toBeNull();
  });
  it('computes step and overall funnel conversion',()=>{
    const steps=funnelSteps([200,100,50,20,10,5]);
    expect(steps.map(step=>step.fromPrevious)).toEqual([null,50,50,40,50,50]);expect(steps.at(-1)!.fromStart).toBe(2.5);
    expect(funnelSteps([0,0,0,0,0,0])[3]!.fromStart).toBe(0);
  });
  it('labels winners from the data only, never revenue',()=>{
    const top={landingPages:[row('/a',30,1,3.3,4),row('/b',10,3,20,1)],matches:[],competitions:[],teams:[],platforms:[],storyAngles:[],creativeFamilies:[],templates:[]};
    const winners=pickWinners(top);
    expect(winners).toEqual([{label:'traffic winner',dimension:'Landing page',key:'/a',value:30},{label:'engagement winner',dimension:'Landing page',key:'/a',value:4},{label:'bookmaker-click winner',dimension:'Landing page',key:'/b',value:3}]);
    expect(winners.some(winner=>/revenue/i.test(winner.label))).toBe(false);
  });
  it('applies transparent scorecard thresholds',()=>{
    const scored=scoreRows('Match',[row('hot',25,4,16),row('cold',30,0,0),row('rising',8,0,0),row('falling',12,0,0)],[row('rising',4,0,0),row('falling',40,2,5)],8);
    const verdict=(key:string)=>scored.find(item=>item.key===key)?.verdict;
    expect(verdict('hot')).toBe('WINNER');expect(verdict('cold')).toBe('WEAK');expect(verdict('rising')).toBe('WATCHLIST');expect(verdict('falling')).toBe('WEAK');
    expect(SCORECARD_RULES.minSessions).toBe(20);
  });
  it('anchors weeks on Monday in São Paulo',()=>{
    expect(weekStart(new Date('2026-09-24T12:00:00Z')).toISOString()).toBe('2026-09-21T03:00:00.000Z');
    // Sunday 23:30 local is still the same week.
    expect(weekStart(new Date('2026-09-28T02:30:00Z')).toISOString()).toBe('2026-09-21T03:00:00.000Z');
  });
  it('never fabricates external metrics',()=>{
    expect(searchConsole.status()).toMatchObject({connected:false,status:'Search Console not connected'});
    expect(socialNativeSources.every(source=>!source.connected)).toBe(true);
  });
});

describe('growth filters and exports',()=>{
  const now=new Date('2026-09-24T12:00:00Z');
  it('allowlists every filter and caps the range',()=>{
    const parsed=parseGrowthQuery({from:'2025-01-01',to:'2026-09-23',source:'tiktok',competition:'DROP TABLE',team:'aaaaaaaaaaaaaaaa',pageType:'nope',locale:'br'},now);
    expect(parsed.preset).toBe('custom');expect(parsed.filters.source).toBe('tiktok');expect(parsed.filters.competition).toBeUndefined();expect(parsed.filters.pageType).toBeUndefined();
    expect((parsed.filters.to.getTime()-parsed.filters.from.getTime())/86_400_000).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    expect(parseGrowthQuery({},now).filters.to).toEqual(now);
    expect(growthQueryString(parseGrowthQuery({range:'30d',geo:'BR'},now))).toBe('range=30d&geo=BR');
    expect(withoutRange(parsed.filters)).not.toHaveProperty('from');
  });
  it('neutralises spreadsheet formulas and quotes CSV correctly',()=>{
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);expect(csvCell('-5')).toBe('-5');expect(csvCell('@cmd')).toBe(`'@cmd`);expect(csvCell(-2)).toBe('-2');
    expect(toCsv([{a:'x,y',b:3}],[{key:'a',label:'A',value:r=>r.a},{key:'b',label:'B',value:r=>r.b}])).toBe('A,B\r\n"x,y",3\r\n');
  });
});
