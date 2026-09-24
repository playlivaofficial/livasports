import type {GrowthReport,RankedEntity,WeeklyScorecard} from '@/analytics/growth-report';
import {BUCKET_LABELS} from '@/analytics/growth-report';
import type {SortableColumn,SortableRow} from './SortableTable';

/**
 * One definition per owner table, shared by the page and the CSV export, so a download always holds
 * exactly the rows and columns the owner is looking at.
 */
export interface TableDefinition {caption:string;columns:SortableColumn[];rows:(report:GrowthReport)=>SortableRow[];}
const RANKED:SortableColumn[]=[{key:'label',label:'Item'},{key:'sessions',label:'Sessions',numeric:true},{key:'matchViews',label:'Match views',numeric:true},
  {key:'slipAdds',label:'Slip adds',numeric:true},{key:'clicks',label:'Bookmaker clicks',numeric:true},{key:'ctr',label:'Session CTR',numeric:true,suffix:'%'}];
const ranked=(rows:RankedEntity[]):SortableRow[]=>rows.map(row=>({label:row.label,sessions:row.sessions,matchViews:row.matchViews,slipAdds:row.slipAdds,clicks:row.clicks,ctr:row.ctr}));
const METRIC_LABELS:Record<string,string>={sessions:'Sessions',organicSessions:'Organic sessions',socialSessions:'Social-attributed sessions',matchViews:'Match-page views',
  oddsInteractions:'Odds interactions',slipAdds:'Slip adds',slipsCreated:'Slips created',slipsOpened:'Slips opened',comparisonSessions:'Sessions with bookmaker comparison',
  ctaClicks:'Bookmaker CTA clicks',outboundRedirects:'Outbound redirects (server-confirmed)',bookmakerCtr:'Bookmaker session CTR (%)'};
export const metricLabel=(key:string)=>METRIC_LABELS[key]??key;

export const GROWTH_TABLES:Record<string,TableDefinition>={
  overview:{caption:'Current vs previous period',columns:[{key:'metric',label:'Metric'},{key:'current',label:'Current',numeric:true},{key:'previous',label:'Previous',numeric:true},
    {key:'change',label:'Change',numeric:true},{key:'changePct',label:'Change %',numeric:true,suffix:'%'}],
    rows:report=>report.deltas.map(delta=>({metric:metricLabel(delta.key),current:delta.current,previous:delta.previous,change:delta.change,changePct:delta.key==='bookmakerCtr'?null:delta.changePct}))},
  funnel:{caption:'Funnel',columns:[{key:'step',label:'Step'},{key:'sessions',label:'Sessions',numeric:true},{key:'fromPrevious',label:'From previous step',numeric:true,suffix:'%'},{key:'fromStart',label:'Overall',numeric:true,suffix:'%'}],
    rows:report=>report.funnel.map(step=>({step:step.label,sessions:step.sessions,fromPrevious:step.fromPrevious,fromStart:step.fromStart}))},
  acquisition:{caption:'Acquisition',columns:[{key:'source',label:'Source'},{key:'sessions',label:'Sessions',numeric:true},{key:'previousSessions',label:'Previous',numeric:true},
    {key:'engaged',label:'Engaged',numeric:true},{key:'slipAdds',label:'Slip adds',numeric:true},{key:'clicks',label:'Bookmaker clicks',numeric:true},{key:'ctr',label:'Session CTR',numeric:true,suffix:'%'}],
    rows:report=>report.acquisition.map(row=>({source:row.label,sessions:row.sessions,previousSessions:row.previousSessions,engaged:row.engaged,slipAdds:row.slipAdds,clicks:row.clicks,ctr:row.ctr}))},
  landing:{caption:'Top landing pages',columns:RANKED,rows:report=>ranked(report.top.landingPages)},
  matches:{caption:'Top matches',columns:RANKED,rows:report=>ranked(report.top.matches)},
  competitions:{caption:'Top competitions',columns:RANKED,rows:report=>ranked(report.top.competitions)},
  teams:{caption:'Top clubs',columns:RANKED,rows:report=>ranked(report.top.teams)},
  platforms:{caption:'Social platforms (site-side UTM / referrer)',columns:RANKED,rows:report=>ranked(report.top.platforms)},
  angles:{caption:'Story angles (Traffic Engine UTM)',columns:RANKED,rows:report=>ranked(report.top.storyAngles)},
  families:{caption:'Creative families (Traffic Engine UTM)',columns:RANKED,rows:report=>ranked(report.top.creativeFamilies)},
  templates:{caption:'Creative templates (Traffic Engine UTM)',columns:RANKED,rows:report=>ranked(report.top.templates)},
  engine:{caption:'Traffic Engine performance',columns:[{key:'fixture',label:'Fixture'},{key:'competition',label:'Competition'},{key:'channel',label:'Platform'},{key:'status',label:'Status'},
    {key:'published',label:'Published'},{key:'angle',label:'Story angle'},{key:'family',label:'Creative family'},{key:'scenery',label:'Scenery'},{key:'characters',label:'Characters'},
    {key:'hook',label:'Hook family'},{key:'cta',label:'CTA family'},{key:'sessions',label:'Landing sessions',numeric:true},{key:'matchViews',label:'Match views',numeric:true},
    {key:'slipAdds',label:'Slip adds',numeric:true},{key:'clicks',label:'Bookmaker clicks',numeric:true}],
    rows:report=>report.trafficEngine.map(row=>({fixture:row.fixture,competition:row.competition,channel:row.channel,status:row.status,published:row.publishedAt?row.publishedAt.slice(0,10):null,
      angle:row.storyAngle,family:row.creativeFamily,scenery:row.scenery,characters:row.characterMode,hook:row.hookFamily,cta:row.ctaFamily,sessions:row.sessions,matchViews:row.matchViews,slipAdds:row.slipAdds,clicks:row.clicks}))},
  organic:{caption:'Organic landing pages',columns:RANKED,rows:report=>ranked(report.seo.topPages)},
  organicCompetitions:{caption:'Organic competitions',columns:RANKED,rows:report=>ranked(report.seo.topCompetitions)},
  quality:{caption:'Traffic classes (sessions started in period)',columns:[{key:'trafficClass',label:'Class'},{key:'sessions',label:'Sessions',numeric:true},{key:'inKpis',label:'Counted in KPIs'}],
    rows:report=>report.quality.sessionsByClass.map(row=>({trafficClass:row.trafficClass,sessions:row.sessions,inKpis:row.trafficClass==='HUMAN'?'yes':'no — excluded'}))},
};
export const bucketLabel=(bucket:string)=>BUCKET_LABELS[bucket as keyof typeof BUCKET_LABELS]??bucket;

export const SCORECARD_COLUMNS:SortableColumn[]=[{key:'verdict',label:'Signal'},{key:'dimension',label:'Dimension'},{key:'label',label:'Item'},{key:'sessions',label:'Sessions',numeric:true},
  {key:'previousSessions',label:'Prior week',numeric:true},{key:'clicks',label:'Bookmaker clicks',numeric:true},{key:'ctr',label:'Session CTR',numeric:true,suffix:'%'},{key:'reason',label:'Why'}];
export const scorecardRows=(card:WeeklyScorecard):SortableRow[]=>[...card.scored.winners,...card.scored.watchlist,...card.scored.weak].map(row=>({verdict:row.verdict,dimension:row.dimension,label:row.label,
  sessions:row.sessions,previousSessions:row.previousSessions,clicks:row.clicks,ctr:row.ctr,reason:row.reason}));
