import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {assessCoverage,assessCompetition,emptyCounts,readCoverageHealth,type CompetitionCoverageInput,type CoverageWindow} from './coverage-health';
import {isProvenTarget,MAX_UNPROVEN_PROBES_PER_TICK,planScheduler,planTarget,splitProviderBatches,type RefreshTarget} from './scheduler-policy';
import {schedulerTournaments} from '@/providers/oddspapi/tournament-catalog';
import {buildComparison} from './comparison';
import {listingMatchWinnerOdds} from './listing';
import {snapshotAbsenceCloseScope} from './ingestion';
import {matchOddsFixture} from './matching';
import {normalizeM5Snapshot} from '@/providers/oddspapi/m5-normalizer';
import type {OddsReadSnapshot,OddsSnapshot,ReadOddsQuote} from './types';
import type {QueryExecutor} from '@/database/client';

/**
 * P0 odds coverage incident regression (2026-09-18): Europa/Conference League and other active competitions
 * were shown without odds although the provider supplies pregame prices. Cases A–J from the incident brief.
 */
const now=new Date('2026-09-18T12:00:00Z');
const hoursAhead=(h:number)=>new Date(now.getTime()+h*3600000).toISOString();
const windows=(over:Partial<Record<CoverageWindow,Partial<ReturnType<typeof emptyCounts>>>>={})=>Object.fromEntries((['24h','3d','7d','14d'] as const).map(k=>[k,{...emptyCounts(),...over[k]}])) as CompetitionCoverageInput['windows'];
const competition=(over:Partial<CompetitionCoverageInput>={}):CompetitionCoverageInput=>({competition:'europa-league',tournamentId:'679',nearestKickoff:hoursAhead(30),lastSuccessAt:hoursAhead(-1),lastAttemptAt:hoursAhead(-1),consecutiveFailures:0,lastError:null,windows:windows(),...over});
const target=(over:Partial<RefreshTarget>={}):RefreshTarget=>({bookmaker:'betano.bet.br',tournamentId:'679',publicEligible:true,hasUsefulCoverage:true,lastSuccessAt:hoursAhead(-1),retryAfter:null,consecutiveFailures:0,
  fixtures:[{id:'f1',kickoff:hoursAhead(30),status:'SCHEDULED'}],...over});
const baseline=[
  {tournamentId:325,tournamentSlug:'brasileiro-serie-a',categorySlug:'brazil'},{tournamentId:27464,tournamentSlug:'liga-mx-apertura',categorySlug:'mexico'},
  {tournamentId:17,tournamentSlug:'premier-league',categorySlug:'england'},{tournamentId:384,tournamentSlug:'copa-libertadores',categorySlug:'international-clubs'},
];

describe('A — competition with upcoming fixtures but no scheduler target',()=>{
  it('is flagged critical by the health contract and becomes a target as soon as its catalog row exists',()=>{
    const report=assessCompetition(competition({tournamentId:null,lastSuccessAt:null,windows:windows({'24h':{fixtures:4,neither:4},'3d':{fixtures:4,neither:4},'7d':{fixtures:4,neither:4},'14d':{fixtures:4,neither:4}})}),now);
    expect(report.state).toBe('critical');expect(report.flags).toEqual(expect.arrayContaining(['NO_SCHEDULER_TARGET','ZERO_COVERAGE_TODAY']));
    // Conference League: identity rule exists, so the provider catalog row is enough — no allowlist edit, no invented ID.
    const scheduled=schedulerTournaments([...baseline,{tournamentId:31415,tournamentSlug:'uefa-europa-conference-league',categorySlug:'international-clubs'}]);
    expect(scheduled.find(t=>t.canonical==='conference-league')).toMatchObject({id:'31415'});
    // A cold target (never refreshed) is due immediately and probed in isolation.
    const plan=planScheduler([target({tournamentId:'31415',lastSuccessAt:null,hasUsefulCoverage:false})],now);
    expect(plan.batches).toEqual([expect.objectContaining({bookmaker:'betano.bet.br',tournamentIds:['31415']})]);
  });
});

describe('B — daily cadence must not leave a near-term competition at zero coverage',()=>{
  it('prioritises missing coverage without bypassing the P5 quota-scaled cadence',()=>{
    const starved=target({tournamentId:'679',hasUsefulCoverage:false,lastSuccessAt:hoursAhead(-7)});
    const covered=target({tournamentId:'7',hasUsefulCoverage:true,lastSuccessAt:hoursAhead(-7)});
    // P5: empty coverage must not pierce the reserve by imposing an unbudgeted recovery floor.
    expect(planTarget(starved,2,now,8)).toMatchObject({recovery:true,intervalMinutes:2880,due:false});
    expect(planTarget(covered,2,now,8)).toMatchObject({recovery:false,intervalMinutes:2880,due:false});
    const plan=planScheduler([covered,starved,target({tournamentId:'23',hasUsefulCoverage:false,lastSuccessAt:hoursAhead(-7),fixtures:[{id:'x',kickoff:hoursAhead(400),status:'SCHEDULED'}]})],now);
    // the recovery feed leads the shared proven request even though the covered feed is also due at budget scale 1
    expect(plan.batches[0].tournamentIds[0]).toBe('679');
  });
});

const quote=(over:Partial<ReadOddsQuote>={}):ReadOddsQuote=>({quoteId:'q',fixtureId:'f',providerFixtureId:'p',bookmaker:'betano.bet.br',bookmakerId:'b',bookmakerName:'Betano BR',market:'MATCH_WINNER',outcome:'HOME',line:null,
  decimalOdds:'2.10',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:now.toISOString(),observedAt:now.toISOString(),persistedAt:now.toISOString(),lastSuccessfulRefreshAt:now.toISOString(),
  providerKickoff:hoursAhead(30),sourceDomain:'www.betano.bet.br',geoEligible:true,freshnessTtlMinutes:120,...over});
const snapshot=(quotes:ReadOddsQuote[]):OddsReadSnapshot=>({kickoff:hoursAhead(30),fixtureStatus:'SCHEDULED',quotes});
describe('C/D/E/G — real-first resolution with disclosed proxy fallback',()=>{
  it('a failed/stopped refresh leaves stored REAL usable until fixed expiry, then disclosed insurance, then unavailable',()=>{
    const own=quote({bookmaker:'sportingbet.bet.br',bookmakerName:'Sportingbet BR',freshnessTtlMinutes:30});
    const insurance=quote({freshnessTtlMinutes:60});
    const stored=snapshot([own,insurance]);const before=JSON.stringify(stored);
    const price=(minutes:number)=>buildComparison(stored,'MATCH_WINNER',+now+minutes*60000).rows.find(r=>r.bookmaker==='sportingbet.bet.br')!.cells[0];
    expect(price(29)).toMatchObject({priceKind:'REAL',sourceBookmaker:'sportingbet.bet.br',decimalOdds:'2.10'});
    expect(price(30)).toMatchObject({priceKind:'PROXY',sourceBookmaker:'betano.bet.br',decimalOdds:'2.10'});
    expect(price(60)).toMatchObject({decimalOdds:null});
    expect(JSON.stringify(stored)).toBe(before);
  });
  it('C: independent Betano and Betsson prices both reach the read model as REAL',()=>{
    const c=buildComparison(snapshot([quote(),quote({bookmaker:'betsson',bookmakerName:'Betsson',bookmakerId:'s',decimalOdds:'2.05'})]),'MATCH_WINNER',now.getTime());
    expect(c.rows.map(r=>[r.bookmaker,r.cells[0].priceKind,r.cells[0].decimalOdds])).toEqual([['betsson','REAL','2.05'],['sportingbet.bet.br','PROXY','2.10'],['1xbet','PROXY','2.10']]);
  });
  it('D: one bookmaker only → the other side shows a disclosed PROXY, never blank',()=>{
    const c=buildComparison(snapshot([quote({bookmaker:'betsson',bookmakerName:'Betsson',bookmakerId:'s',decimalOdds:'2.05'})]),'MATCH_WINNER',now.getTime());
    expect(c.rows.map(r=>[r.bookmaker,r.cells[0].priceKind,r.cells[0].decimalOdds])).toEqual([['betsson','REAL','2.05'],['sportingbet.bet.br','PROXY','2.05'],['1xbet','PROXY','2.05']]);
  });
  it('E: neither bookmaker → unavailable, never invented',()=>{
    const listing=listingMatchWinnerOdds(snapshot([]),now.getTime());
    expect(listing.oddsState).toBe('none');expect(listing.odds).toEqual([]);
  });
  it('G: a REAL quote replaces a proxy immediately, and a stale REAL quote falls back to the peer proxy',()=>{
    const betsson=quote({bookmaker:'betsson',bookmakerName:'Betsson',bookmakerId:'s',decimalOdds:'2.05'});
    const before=buildComparison(snapshot([betsson]),'MATCH_WINNER',now.getTime());
    expect(before.rows[1].bookmaker).toBe('sportingbet.bet.br');expect(before.rows[1].cells[0]).toMatchObject({priceKind:'PROXY',decimalOdds:'2.05'});
    const after=buildComparison(snapshot([betsson,quote({bookmaker:'sportingbet.bet.br',decimalOdds:'2.20'})]),'MATCH_WINNER',now.getTime());
    expect(after.rows[1].cells[0]).toMatchObject({priceKind:'REAL',decimalOdds:'2.20'});
    const stale=buildComparison(snapshot([betsson,quote({bookmaker:'sportingbet.bet.br',decimalOdds:'2.20',observedAt:hoursAhead(-5),freshnessTtlMinutes:60})]),'MATCH_WINNER',now.getTime());
    expect(stale.rows[1].cells[0]).toMatchObject({priceKind:'PROXY',decimalOdds:'2.05'});
  });
});

describe('F — approved Betsson normalizer semantics are preserved',()=>{
  it('keeps listed decimals on an active market when bookmaker-level flags are noisy',()=>{
    const price={active:false,playerName:null,price:2.12,changedAt:now.toISOString(),bookmakerChangedAt:null,mainLine:false};
    const fixture={fixtureId:'ext-679-1',sportId:10,tournamentId:679,startTime:hoursAhead(30),statusId:0,participant1Id:1,participant2Id:2,participant1Name:'Roma',participant2Name:'Lyon',
      bookmakerOdds:{betsson:{bookmakerIsActive:false,suspended:true,fixturePath:'https://www.betsson.com/fixture',markets:{'101':{marketActive:true,outcomes:{'101':{players:{'0':price}}}}}}}};
    const result=normalizeM5Snapshot([fixture],'betsson',now.toISOString(),['679'],[{id:'679',slug:'uefa-europa-league',category:'international-clubs',canonical:'europa-league'}]);
    expect(result.quotes[0]).toMatchObject({bookmaker:'betsson',decimalOdds:'2.12',status:'ACTIVE'});
    const dead=structuredClone(fixture);dead.bookmakerOdds.betsson.markets['101'].marketActive=false;
    expect(normalizeM5Snapshot([dead],'betsson',now.toISOString(),['679'],[{id:'679',slug:'uefa-europa-league',category:'international-clubs',canonical:'europa-league'}]).quotes[0].status).toBe('SUSPENDED');
  });
});

describe('H — narrower snapshot never closes quotes outside its listed fixtures',()=>{
  it('scopes closes to fixtures the snapshot actually returned',()=>{
    const s:OddsSnapshot={bookmaker:'betano.bet.br',observedAt:now.toISOString(),tournamentIds:['679'],
      fixtures:[{providerId:'p1',sport:'FOOTBALL',competition:'europa-league',providerCompetitionId:'679',kickoff:hoursAhead(30),status:'PREGAME',homeProviderId:'1',awayProviderId:'2',homeNames:['A'],awayNames:['B']}],quotes:[],rejected:{}};
    const scope=snapshotAbsenceCloseScope(s,['11111111-1111-4111-8111-111111111111']);
    expect(scope.fixtureIds).toEqual(['11111111-1111-4111-8111-111111111111']);expect(scope.providerFixtureIds).toEqual(['p1']);
  });
});

describe('I — kickoff tolerance keeps odds on the canonical fixture',()=>{
  it('matches a fixture whose provider kickoff drifted inside the approved tolerance and refuses larger drifts',()=>{
    const canonical={id:'c',competitionId:'x',competition:'europa-league',sport:'FOOTBALL',kickoff:hoursAhead(30),status:'SCHEDULED',homeId:'h',home:'Roma',awayId:'a',away:'Lyon'};
    const raw={providerId:'p',sport:'FOOTBALL' as const,competition:'europa-league',providerCompetitionId:'679',kickoff:new Date(Date.parse(canonical.kickoff)+5*60000).toISOString(),status:'PREGAME' as const,homeProviderId:'1',awayProviderId:'2',homeNames:['Roma'],awayNames:['Lyon']};
    expect(matchOddsFixture(raw,[canonical],[]).fixture?.id).toBe('c');
    expect(matchOddsFixture({...raw,kickoff:new Date(Date.parse(canonical.kickoff)+3*3600000).toISOString()},[canonical],[]).fixture).toBeFalsy();
  });
});

describe('J — zero-coverage competitions are detected and actionable',()=>{
  it('reports critical for today, warning for near-term, healthy for covered, idle for no fixtures; sorts unhealthy first',()=>{
    const health=assessCoverage([
      competition({competition:'premier-league',tournamentId:'17',windows:windows({'24h':{fixtures:10,anyOdds:10,matchWinner:10,totalGoals25:9,btts:9,betanoReal:10,betssonReal:10,bothReal:10},'3d':{fixtures:10,anyOdds:10,matchWinner:10,betanoReal:10,betssonReal:10,bothReal:10},'7d':{fixtures:10,anyOdds:10,matchWinner:10,betanoReal:10,betssonReal:10,bothReal:10},'14d':{fixtures:20,anyOdds:10,matchWinner:10,betanoReal:10,betssonReal:10,bothReal:10,neither:10}})}),
      competition({competition:'fa-cup',tournamentId:'19',lastSuccessAt:hoursAhead(-30),windows:windows({'24h':{fixtures:27,neither:27},'3d':{fixtures:27,neither:27},'7d':{fixtures:27,neither:27},'14d':{fixtures:27,neither:27}})}),
      competition({competition:'la-liga-2',tournamentId:null,windows:windows({'3d':{fixtures:11,neither:11},'7d':{fixtures:11,neither:11},'14d':{fixtures:22,neither:22}})}),
      competition({competition:'conference-league',tournamentId:null,windows:windows({'14d':{fixtures:0}})}),
      competition({competition:'super-lig',tournamentId:'52',windows:windows({'7d':{fixtures:9,anyOdds:9,matchWinner:9,betanoReal:0,betssonReal:9,bothReal:0,proxyOnly:9},'14d':{fixtures:9,anyOdds:9,matchWinner:9,betssonReal:9,proxyOnly:9}})}),
    ],now);
    expect(health.competitions.map(c=>[c.competition,c.state])).toEqual([['fa-cup','critical'],['la-liga-2','critical'],['super-lig','warning'],['premier-league','healthy'],['conference-league','idle']]);
    expect(health.competitions[0].flags).toEqual(expect.arrayContaining(['ZERO_COVERAGE_TODAY','REFRESH_OVERDUE']));
    expect(health.competitions[1].flags).toEqual(expect.arrayContaining(['NO_SCHEDULER_TARGET','ZERO_COVERAGE_NEAR_TERM']));
    expect(health.competitions[2].flags).toEqual(expect.arrayContaining(['BETANO_REAL_COLLAPSE','PROXY_DOMINANT']));
    expect(health.counts).toEqual({healthy:1,warning:1,critical:2,idle:1});expect(health.state).toBe('critical');
    expect(health.windows['24h']).toMatchObject({fixtures:37,anyOdds:10,anyOddsPct:27});
    expect(health.competitions[3].windows['7d']).toMatchObject({matchWinnerPct:100,betanoRealPct:100,proxyPct:0});
  });
  it('reads the contract with one bounded query and never touches a provider',async()=>{
    const query=vi.fn(async(...args:[string])=>({sql:args[0],rows:[{competition:'europa-league',tournament_id:'679',nearest_kickoff:hoursAhead(40),last_success_at:hoursAhead(-2),last_attempt_at:hoursAhead(-2),consecutive_failures:0,last_error:null,
      '24h_fixtures':0,'24h_any':0,'24h_mw':0,'24h_ou25':0,'24h_btts':0,'24h_betano':0,'24h_betsson':0,'24h_both':0,'24h_proxy':0,'24h_neither':0,'24h_stale':0,
      '3d_fixtures':9,'3d_any':9,'3d_mw':9,'3d_ou25':9,'3d_btts':9,'3d_betano':9,'3d_betsson':7,'3d_both':7,'3d_proxy':2,'3d_neither':0,'3d_stale':0,
      '7d_fixtures':9,'7d_any':9,'7d_mw':9,'7d_ou25':9,'7d_btts':9,'7d_betano':9,'7d_betsson':7,'7d_both':7,'7d_proxy':2,'7d_neither':0,'7d_stale':0,
      '14d_fixtures':9,'14d_any':9,'14d_mw':9,'14d_ou25':9,'14d_btts':9,'14d_betano':9,'14d_betsson':7,'14d_both':7,'14d_proxy':2,'14d_neither':0,'14d_stale':0}],rowCount:1}));
    const health=await readCoverageHealth({query:query as unknown as QueryExecutor['query']},now);
    expect(query).toHaveBeenCalledTimes(1);expect(String(query.mock.calls[0][0])).not.toMatch(/https?:|\/v4\//i);
    expect(health.competitions[0]).toMatchObject({competition:'europa-league',state:'healthy',flags:[],lastRefreshAgeMinutes:120});
    expect(health.competitions[0].windows['3d']).toMatchObject({fixtures:9,anyOddsPct:100,betssonRealPct:77.8,proxyPct:22.2});
  });
});

describe('throughput — proven feeds share requests, unproven ones stay isolated and bounded',()=>{
  it('batches proven expanded tournaments in fours and caps unproven singletons per tick',()=>{
    const proven=['679','7','8','35','23','34'].map(id=>target({tournamentId:id,lastSuccessAt:hoursAhead(-8)}));
    const unproven=['31415','19','329','955'].map(id=>target({tournamentId:id,lastSuccessAt:null}));
    expect(isProvenTarget(target({lastSuccessAt:hoursAhead(-3),consecutiveFailures:0}))).toBe(true);
    expect(isProvenTarget(target({lastSuccessAt:hoursAhead(-3),consecutiveFailures:2}))).toBe(false);
    expect(splitProviderBatches([...proven,...unproven]).map(b=>b.length)).toEqual([4,2,1,1,1,1]);
    const plan=planScheduler([...proven,...unproven],now);
    const betano=plan.batches.filter(b=>b.bookmaker==='betano.bet.br');
    expect(betano.map(b=>b.tournamentIds.length)).toEqual([4,2,1,1]);
    expect(betano.filter(b=>b.tournamentIds.length===1)).toHaveLength(MAX_UNPROVEN_PROBES_PER_TICK);
    expect(plan.batches.every(b=>b.tournamentIds.length<=4)).toBe(true);
  });
});
