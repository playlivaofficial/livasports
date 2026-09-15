import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/odds/read-repository',()=>({readSlipComparison:vi.fn(),readPublicOddsFixtures:vi.fn()}));
import {readSlipComparison,readPublicOddsFixtures} from '@/odds/read-repository';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {offerDependencies,resolveOffer} from './service';
import {campaign,context,dependencies} from './fixtures.test-support';
const db={query:vi.fn()};
beforeEach(()=>vi.clearAllMocks());
it.each(['complete','incomplete','stale','suspended','kickoff','finished','mx'])('M8 reuses actual M7 eligibility: %s',async state=>{
  const now=Date.now(),f=comparisonFixture(3,now);const first=f.data.fixtures.values().next().value!;
  if(state==='incomplete')first.snapshot.quotes=first.snapshot.quotes.filter(q=>q.bookmaker!=='betsson');
  if(state==='stale'||state==='suspended')first.snapshot.quotes.forEach(q=>{q.status=state==='stale'?'STALE':'SUSPENDED';});
  if(state==='kickoff'){first.snapshot.kickoff=new Date(now-1).toISOString();first.fixture.kickoff=first.snapshot.kickoff;}
  if(state==='finished'){first.snapshot.fixtureStatus='FINISHED';first.fixture.status='FINISHED';}
  if(state==='mx')f.data.bookmakers=[];
  vi.mocked(readSlipComparison).mockResolvedValue(f.data);
  const result=await offerDependencies(db).pricing({...context(),selections:f.selections},'betsson',now);
  expect(result!==null).toBe(state==='complete'||state==='incomplete');expect(readSlipComparison).toHaveBeenCalledTimes(1);expect(db.query).not.toHaveBeenCalled();
});
it.each(['current','stale','kickoff'])('M8 match CTA requires current pregame price: %s',async state=>{
  const now=Date.now(),f=comparisonFixture(1,now),fixture=f.data.fixtures.values().next().value!;
  if(state==='stale')fixture.snapshot.quotes.forEach(q=>{q.status='STALE';});if(state==='kickoff')fixture.snapshot.kickoff=new Date(now-1).toISOString();
  vi.mocked(readPublicOddsFixtures).mockResolvedValue(f.data.fixtures);
  const result=await offerDependencies(db).pricing({locale:'br',pagePath:'/br/jogo/test-'+fixture.fixture.publicId,placement:'match_odds_table',fixturePublicId:fixture.fixture.publicId,market:'MATCH_WINNER',bookmaker:'betsson'},'betsson',now);
  expect(result!==null).toBe(state==='current');
});
it('requires one approved creative and never selects campaigns by commission',async()=>{
  const c=campaign(),deps=dependencies(c),x={locale:'br' as const,pagePath:'/br',placement:'mobile_inline' as const};c.placements.push('mobile_inline');
  expect(await resolveOffer(x,deps)).toBeNull();c.creatives=[{id:'local-test-only',locale:'br',placement:'mobile_inline',approved:true,enabled:true,imageUrl:'/sponsors/local-test-only.png',imageAlt:'Local test',width:320,height:100,startsAt:null,endsAt:null}];
  expect((await resolveOffer(x,deps))?.creative?.id).toBe('local-test-only');deps.campaigns=async()=>[c,{...c,id:'another'}];expect(await resolveOffer(x,deps)).toBeNull();
});
