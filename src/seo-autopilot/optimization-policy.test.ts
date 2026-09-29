import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {actionGate,assessExperiment,classifyBrand,detectGrowthOpportunities,experimentArm,metricValid,optimizationSafety,pageType,queryIntent,queryRelevant,seoLinkBoostScore,seoPerformanceWeightAdjustment,type GrowthPage,type Metric} from './optimization-policy';
import {growthMetric} from './optimization-data';
const now=new Date('2026-09-29T12:00:00Z');
const m=(x:Partial<Metric>={}):Metric=>({impressions:600,clicks:30,ctr:.05,position:12,days:28,positionSpread:1,...x});
export const growthPage=(x:Partial<GrowthPage>={}):GrowthPage=>({url:'https://livasports.com/br/jogo/santos-x-flamengo-1111111111111111',type:'FIXTURE',locale:'br',entityId:'1111111111111111',cluster:'br-serie-a',label:'Santos x Flamengo',
  current:m(),previous:m({impressions:500}),queries:[{query:'santos flamengo',impressions:300,clicks:5,position:12,days:14}],countries:[],devices:[],publishedAt:'2026-06-01',lastChangedAt:null,firstObserved:'2026-07-01',managed:true,status:'SCHEDULED',technicalHealthy:true,fresh:true,activeExperiment:false,title:'Santos x Flamengo',description:'Horário programado',linkBoost:0,...x});
describe('growth classification and source evidence',()=>{
  it.each(['LivaSports','liva sports','LIVASPORT','livva sports','livasprots'])('recognizes brand %s',q=>expect(classifyBrand(q)).toBe('BRAND'));
  it.each(['','x','unrecognized','liva','https://example.com'])('keeps unknown separate: %s',q=>expect(classifyBrand(q)).toBe('UNKNOWN'));
  it.each(['Santos vs Flamengo','football results','próximos jogos'])('recognizes semantic non-brand %s',q=>expect(classifyBrand(q)).toBe('NON_BRAND'));
  it.each([['/br/jogo/a','FIXTURE'],['/mx/equipo/a','TEAM'],['/br/futebol?competition=br-serie-a','COMPETITION'],['/en','HUB'],['/owner','OTHER']])('uses actual route family %s',(path,type)=>expect(pageType('https://livasports.com'+path)).toBe(type));
  it('requires exact normalized entity tokens, not unrelated popular queries',()=>{expect(queryRelevant('São Paulo Santos','Sao Paulo x Santos')).toBe(true);expect(queryRelevant('free football streams','Santos x Flamengo')).toBe(false);expect(queryRelevant('classificação','')).toBe(false);});
  it.each([['retrospecto Santos','H2H'],['últimos resultados','FORM'],['tabela classificação','STANDINGS'],['próximos jogos','SCHEDULE']])('clusters one URL intent %s',(q,intent)=>expect(queryIntent(q)).toBe(intent));
  it('weights position and CTR by impressions rather than averaging percentages',()=>expect(growthMetric([{day:'a',impressions:100,clicks:10,position:10},{day:'b',impressions:900,clicks:0,position:20}])).toMatchObject({impressions:1000,clicks:10,ctr:.01,position:19,days:2}));
  it.each([NaN,Infinity,-1])('rejects invalid impressions %s',n=>expect(metricValid(m({impressions:n}))).toBe(false));
});
describe('confidence-gated detectors',()=>{
  it('detects stable striking distance with medium confidence and bounded links',()=>{const p=growthPage({current:m({days:10})}),o=detectGrowthOpportunities([p],now)[0];expect(o).toMatchObject({detector:'STRIKING_DISTANCE',confidence:'MEDIUM',proposedAction:'INTERNAL_LINK_BOOST'});expect(seoLinkBoostScore(o)).toBeLessThanOrEqual(5);});
  it('low samples remain discovery not action',()=>{const o=detectGrowthOpportunities([growthPage({current:m({days:1,impressions:35})})],now)[0];expect(o.confidence).toBe('LOW');expect(seoLinkBoostScore(o)).toBe(0);});
  it('missing query relationship cannot be medium',()=>expect(detectGrowthOpportunities([growthPage({queries:[]})],now)[0].confidence).toBe('LOW'));
  it('declining demand does not trigger a link boost',()=>expect(detectGrowthOpportunities([growthPage({current:m({impressions:100}),previous:m({impressions:1000})})],now).find(o=>o.detector==='STRIKING_DISTANCE')?.proposedAction).toBe('OBSERVE'));
  it('high CTR evidence needs same type/locale/intent/position peer cohort',()=>{
    const p=growthPage({current:m({clicks:0,ctr:0})}),peers=Array.from({length:5},(_,i)=>growthPage({url:`https://livasports.com/br/jogo/peer-${i}`}));
    expect(detectGrowthOpportunities([p,...peers],now).find(o=>o.url===p.url&&o.detector==='LOW_CTR')).toMatchObject({confidence:'HIGH',cohortSize:5,proposedAction:'TITLE_PATTERN'});
    expect(detectGrowthOpportunities([p,...peers.map(x=>({...x,type:'TEAM' as const}))],now).find(o=>o.url===p.url&&o.detector==='LOW_CTR')).toMatchObject({confidence:'LOW',benchmark:null,proposedAction:'OBSERVE'});
  });
  it('flags growth only with clicks, impressions, rank and comparable days',()=>{expect(detectGrowthOpportunities([growthPage({current:m({impressions:900,clicks:50}),previous:m({impressions:600,clicks:30,position:13})})],now).some(o=>o.detector==='WINNING_PAGE')).toBe(true);});
  it('diagnoses decaying winners instead of rewriting or deleting',()=>expect(detectGrowthOpportunities([growthPage({current:m({impressions:100}),previous:m({impressions:1000})})],now).find(o=>o.detector==='DECAYING_WINNER')?.proposedAction).toBe('DIAGNOSE_ONLY'));
  it('aged low value only reduces future effort',()=>expect(detectGrowthOpportunities([growthPage({publishedAt:'2026-01-01',current:m({impressions:0,clicks:0,ctr:0})})],now).find(o=>o.detector==='LOW_VALUE')?.proposedAction).toBe('RESOURCE_REVIEW'));
  it('never turns insufficient history into low-value judgement',()=>expect(detectGrowthOpportunities([growthPage({publishedAt:'2026-09-25',current:m({impressions:0,clicks:0,ctr:0,days:1})})],now).some(o=>o.detector==='LOW_VALUE')).toBe(false));
  it('reruns are deterministic regardless of input order',()=>{const a=growthPage(),b=growthPage({url:a.url+'b'});expect(detectGrowthOpportunities([a,b],now)).toEqual(detectGrowthOpportunities([b,a],now));});
});
describe('fail-safe, caps, cooldowns and no oscillation',()=>{
  const health={connected:true,complete:true,latestDay:'2026-09-26',expectedDay:'2026-09-26',observedDays:11,valid:true,dailyImpressions:[50,60,55,54,56,57,60]};
  it('enables qualified links without forcing metadata on a young dataset',()=>expect(optimizationSafety(health).mode).toBe('ACTIVE'));
  it.each([{connected:false},{complete:false},{latestDay:'2026-09-25'},{observedDays:2},{valid:false},{dailyImpressions:[50,50,50,50,50,50,1000]}])('observes only on unsafe measurement %j',patch=>expect(optimizationSafety({...health,...patch}).mode).toBe('OBSERVE_ONLY'));
  it.each(['LOW','MEDIUM'] as const)('never rewrites metadata at %s confidence',confidence=>expect(actionGate(growthPage(),'TITLE_PATTERN',confidence,now,0,'ACTIVE')).not.toBe('ELIGIBLE'));
  it.each([{managed:false},{fresh:false},{technicalHealthy:false},{activeExperiment:true},{lastChangedAt:'2026-09-28'},{locale:'mx'}])('protects existing/unsafe page %j',patch=>expect(actionGate(growthPage(patch),'TITLE_PATTERN','HIGH',now,0,'ACTIVE')).not.toBe('ELIGIBLE'));
  it('permits mature safe page but enforces both title/meta shared daily cap',()=>{expect(actionGate(growthPage(),'TITLE_PATTERN','HIGH',now,0,'ACTIVE')).toBe('ELIGIBLE');expect(actionGate(growthPage(),'TITLE_PATTERN','HIGH',now,1,'ACTIVE')).toBe('DAILY_CAP');});
  it('enforces link cap',()=>expect(actionGate(growthPage(),'INTERNAL_LINK_BOOST','MEDIUM',now,3,'ACTIVE')).toBe('DAILY_CAP'));
  it('observation only blocks all visible changes',()=>expect(actionGate(growthPage(),'TITLE_PATTERN','HIGH',now,0,'OBSERVE_ONLY')).toBe('OBSERVE_ONLY'));
  it('cluster learning moves no more than one point and never compounds',()=>{expect(seoPerformanceWeightAdjustment(0,4,0,4,true)).toBe(1);expect(seoPerformanceWeightAdjustment(3,4,0,4,true)).toBe(3);expect(seoPerformanceWeightAdjustment(-3,0,4,4,true)).toBe(-2);});
  it('old signals decay to neutral; failed sync freezes weights',()=>{expect(seoPerformanceWeightAdjustment(3,0,0,0,true)).toBe(2);expect(seoPerformanceWeightAdjustment(3,0,0,0,false)).toBe(3);});
  it('one page cannot become a winning cluster',()=>expect(seoPerformanceWeightAdjustment(0,1,0,1,true)).toBe(0));
  it('deterministic assignments include both arms',()=>{const a=Array.from({length:20},(_,i)=>experimentArm(`cohort:${i}`));expect(new Set(a).size).toBe(2);expect(a).toEqual(Array.from({length:20},(_,i)=>experimentArm(`cohort:${i}`)));});
  it('does not declare winners on small or partial samples',()=>expect(assessExperiment(m(),m({impressions:10}),m(),m(),28)).toBe('INSUFFICIENT_EVIDENCE'));
  it('does not call seven days a winner',()=>expect(assessExperiment(m(),m(),m(),m(),7)).toBe('OBSERVING'));
  it('freezes significant controlled deterioration, not ordinary noise',()=>expect(assessExperiment(m(),m({clicks:5,ctr:.008}),m(),m(),14)).toBe('FREEZE_REVIEW'));
  it('shared demand shifts do not force a rollback',()=>expect(assessExperiment(m(),m({clicks:5,ctr:.008}),m(),m({clicks:5,ctr:.008}),14)).toBe('OBSERVING'));
});
