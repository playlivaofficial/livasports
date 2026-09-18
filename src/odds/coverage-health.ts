import type {QueryExecutor} from '@/database/client';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';

/**
 * P0 odds coverage health contract. The commercial question is "does a user who opens an upcoming
 * fixture see provider-backed pregame odds?", so coverage is measured per competition over the
 * next 24h / 3d / 7d / 14d — never as one full-calendar number that hides a dead tournament.
 */
export const COVERAGE_WINDOWS=['24h','3d','7d','14d'] as const;
export type CoverageWindow=typeof COVERAGE_WINDOWS[number];
export const COVERAGE_WINDOW_HOURS:Record<CoverageWindow,number>={'24h':24,'3d':72,'7d':168,'14d':336};

export interface CoverageWindowCounts {
  fixtures:number;anyOdds:number;matchWinner:number;totalGoals25:number;btts:number;
  betanoReal:number;betssonReal:number;bothReal:number;proxyOnly:number;neither:number;staleOnly:number;
}
export interface CompetitionCoverageInput {
  competition:string;tournamentId:string|null;nearestKickoff:string|null;
  lastSuccessAt:string|null;lastAttemptAt:string|null;consecutiveFailures:number;lastError:string|null;
  windows:Record<CoverageWindow,CoverageWindowCounts>;
}
export type CoverageFlag='NO_SCHEDULER_TARGET'|'ZERO_COVERAGE_NEAR_TERM'|'ZERO_COVERAGE_TODAY'|'REFRESH_OVERDUE'
  |'BETANO_REAL_COLLAPSE'|'BETSSON_REAL_COLLAPSE'|'BOTH_BOOKMAKERS_COLLAPSE'|'PROXY_DOMINANT'|'STALE_QUOTES'|'TARGET_FAILING';
export type CoverageState='healthy'|'warning'|'critical'|'idle';
export interface CoverageWindowReport extends CoverageWindowCounts {
  anyOddsPct:number;matchWinnerPct:number;totalGoals25Pct:number;bttsPct:number;betanoRealPct:number;betssonRealPct:number;proxyPct:number;neitherPct:number;stalePct:number;
}
export interface CompetitionCoverageReport {
  competition:string;tournamentId:string|null;nearestKickoff:string|null;lastSuccessAt:string|null;lastRefreshAgeMinutes:number|null;
  consecutiveFailures:number;lastError:string|null;state:CoverageState;flags:CoverageFlag[];windows:Record<CoverageWindow,CoverageWindowReport>;
}
export interface CoverageHealth {
  at:string;state:CoverageState;counts:{healthy:number;warning:number;critical:number;idle:number};
  competitions:CompetitionCoverageReport[];windows:Record<CoverageWindow,CoverageWindowReport>;
}
const pct=(n:number,d:number)=>d?Math.round(n/d*1000)/10:0;
export function reportWindow(c:CoverageWindowCounts):CoverageWindowReport{
  return {...c,anyOddsPct:pct(c.anyOdds,c.fixtures),matchWinnerPct:pct(c.matchWinner,c.fixtures),totalGoals25Pct:pct(c.totalGoals25,c.fixtures),bttsPct:pct(c.btts,c.fixtures),
    betanoRealPct:pct(c.betanoReal,c.fixtures),betssonRealPct:pct(c.betssonReal,c.fixtures),proxyPct:pct(c.proxyOnly,c.anyOdds),neitherPct:pct(c.neither,c.fixtures),stalePct:pct(c.staleOnly,c.fixtures)};
}
export const emptyCounts=():CoverageWindowCounts=>({fixtures:0,anyOdds:0,matchWinner:0,totalGoals25:0,btts:0,betanoReal:0,betssonReal:0,bothReal:0,proxyOnly:0,neither:0,staleOnly:0});
/** Longest acceptable gap since the last successful refresh for a competition with fixtures inside 7 days. */
export const REFRESH_OVERDUE_MINUTES=12*60;

export function assessCompetition(input:CompetitionCoverageInput,now=new Date()):CompetitionCoverageReport{
  const w=input.windows,flags:CoverageFlag[]=[];
  const age=input.lastSuccessAt?Math.round((now.getTime()-Date.parse(input.lastSuccessAt))/60000):null;
  const active=w['14d'].fixtures>0;
  if(!active)return {...base(input,age),state:'idle',flags};
  if(!input.tournamentId)flags.push('NO_SCHEDULER_TARGET');
  if(w['24h'].fixtures>0&&w['24h'].anyOdds===0)flags.push('ZERO_COVERAGE_TODAY');
  else if(w['3d'].fixtures>0&&w['3d'].anyOdds===0)flags.push('ZERO_COVERAGE_NEAR_TERM');
  if(w['7d'].fixtures>0&&(age===null||age>REFRESH_OVERDUE_MINUTES))flags.push('REFRESH_OVERDUE');
  const seven=w['7d'];
  if(seven.fixtures>=5){
    const peer=Math.max(seven.betanoReal,seven.betssonReal);
    const betanoDown=seven.betanoReal===0||seven.betanoReal/peer<0.1,betssonDown=seven.betssonReal===0||seven.betssonReal/peer<0.1;
    if(peer>0&&betanoDown&&betssonDown)flags.push('BOTH_BOOKMAKERS_COLLAPSE');
    else if(peer>0&&betanoDown)flags.push('BETANO_REAL_COLLAPSE');
    else if(peer>0&&betssonDown)flags.push('BETSSON_REAL_COLLAPSE');
    if(seven.anyOdds>=5&&seven.proxyOnly/seven.anyOdds>0.8)flags.push('PROXY_DOMINANT');
    if(seven.staleOnly/seven.fixtures>0.5)flags.push('STALE_QUOTES');
  }
  if(input.consecutiveFailures>=3)flags.push('TARGET_FAILING');
  const critical=flags.includes('ZERO_COVERAGE_TODAY')||(flags.includes('NO_SCHEDULER_TARGET')&&w['7d'].fixtures>0)||flags.includes('BOTH_BOOKMAKERS_COLLAPSE')
    ||(flags.includes('ZERO_COVERAGE_NEAR_TERM')&&flags.includes('REFRESH_OVERDUE'));
  return {...base(input,age),state:critical?'critical':flags.length?'warning':'healthy',flags};
}
function base(input:CompetitionCoverageInput,age:number|null){
  return {competition:input.competition,tournamentId:input.tournamentId,nearestKickoff:input.nearestKickoff,lastSuccessAt:input.lastSuccessAt,lastRefreshAgeMinutes:age,
    consecutiveFailures:input.consecutiveFailures,lastError:input.lastError,
    windows:Object.fromEntries(COVERAGE_WINDOWS.map(k=>[k,reportWindow(input.windows[k])])) as Record<CoverageWindow,CoverageWindowReport>};
}
export function assessCoverage(inputs:readonly CompetitionCoverageInput[],now=new Date()):CoverageHealth{
  const competitions=inputs.map(i=>assessCompetition(i,now)).sort((a,b)=>rank(b.state)-rank(a.state)||(Date.parse(a.nearestKickoff??'')||Infinity)-(Date.parse(b.nearestKickoff??'')||Infinity));
  const counts={healthy:0,warning:0,critical:0,idle:0};for(const c of competitions)counts[c.state]++;
  const totals=Object.fromEntries(COVERAGE_WINDOWS.map(k=>{const sum=emptyCounts();for(const i of inputs)for(const key of Object.keys(sum) as (keyof CoverageWindowCounts)[])sum[key]+=i.windows[k][key];return [k,reportWindow(sum)];})) as Record<CoverageWindow,CoverageWindowReport>;
  return {at:now.toISOString(),state:counts.critical?'critical':counts.warning?'warning':'healthy',counts,competitions,windows:totals};
}
const rank=(s:CoverageState)=>s==='critical'?3:s==='warning'?2:s==='healthy'?1:0;

/** Current quote per the public read model: ACTIVE pregame, inside its own freshness TTL, kickoff agreeing with the fixture. */
const CURRENT=`o.status='ACTIVE' AND o.phase='PREGAME' AND o.scope='FULL_TIME_REGULATION' AND o.freshness_ttl_minutes IS NOT NULL AND o.freshness_ttl_minutes>0
  AND o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now() AND o.provider_kickoff IS NOT NULL AND abs(extract(epoch from (f.kickoff-o.provider_kickoff)))<=600`;
export async function readCoverageHealth(db:QueryExecutor,now=new Date()):Promise<CoverageHealth>{
  const rows=(await db.query(`WITH fx AS (
      SELECT f.id,f.kickoff,c.slug,c.id AS competition_id FROM fixtures f JOIN competitions c ON c.id=f.competition_id
      WHERE c.enabled AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<=now()+interval '14 days' AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)),
    cur AS (SELECT o.fixture_id,b.provider_slug AS book,o.market_code AS market,o.line FROM odds_current o JOIN fixtures f ON f.id=o.fixture_id JOIN bookmakers b ON b.id=o.bookmaker_id
      WHERE ${CURRENT} AND o.fixture_id IN (SELECT id FROM fx)),
    per AS (SELECT fx.slug,fx.kickoff,EXTRACT(EPOCH FROM (fx.kickoff-now()))/3600 AS hours,
      EXISTS(SELECT 1 FROM cur WHERE cur.fixture_id=fx.id) AS any_odds,
      EXISTS(SELECT 1 FROM cur WHERE cur.fixture_id=fx.id AND market='MATCH_WINNER') AS mw,
      EXISTS(SELECT 1 FROM cur WHERE cur.fixture_id=fx.id AND market='TOTAL_GOALS' AND line=2.5) AS ou25,
      EXISTS(SELECT 1 FROM cur WHERE cur.fixture_id=fx.id AND market='BTTS') AS btts,
      EXISTS(SELECT 1 FROM cur WHERE cur.fixture_id=fx.id AND book='betano.bet.br') AS betano,
      EXISTS(SELECT 1 FROM cur WHERE cur.fixture_id=fx.id AND book='betsson') AS betsson,
      EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=fx.id) AS any_row
      FROM fx)
    SELECT c.slug AS competition,
      (SELECT m.provider_entity_id FROM provider_entity_mappings m WHERE m.provider='ODDSPAPI' AND m.entity_type='COMPETITION' AND m.livasports_entity_id=c.id LIMIT 1) AS tournament_id,
      (SELECT min(kickoff) FROM per WHERE per.slug=c.slug) AS nearest_kickoff,
      t.last_success_at,t.last_attempt_at,t.consecutive_failures,t.last_error,
      ${COVERAGE_WINDOWS.map(k=>{const h=COVERAGE_WINDOW_HOURS[k];const w=`per.slug=c.slug AND per.hours<=${h}`;return `
      count(per.*) FILTER (WHERE ${w})::int AS "${k}_fixtures",
      count(per.*) FILTER (WHERE ${w} AND any_odds)::int AS "${k}_any",
      count(per.*) FILTER (WHERE ${w} AND mw)::int AS "${k}_mw",
      count(per.*) FILTER (WHERE ${w} AND ou25)::int AS "${k}_ou25",
      count(per.*) FILTER (WHERE ${w} AND btts)::int AS "${k}_btts",
      count(per.*) FILTER (WHERE ${w} AND betano)::int AS "${k}_betano",
      count(per.*) FILTER (WHERE ${w} AND betsson)::int AS "${k}_betsson",
      count(per.*) FILTER (WHERE ${w} AND betano AND betsson)::int AS "${k}_both",
      count(per.*) FILTER (WHERE ${w} AND any_odds AND NOT (betano AND betsson))::int AS "${k}_proxy",
      count(per.*) FILTER (WHERE ${w} AND NOT any_odds)::int AS "${k}_neither",
      count(per.*) FILTER (WHERE ${w} AND NOT any_odds AND any_row)::int AS "${k}_stale"`;}).join(',')}
    FROM competitions c
    LEFT JOIN per ON per.slug=c.slug
    LEFT JOIN LATERAL (SELECT max(last_success_at) AS last_success_at,max(last_attempt_at) AS last_attempt_at,max(consecutive_failures)::int AS consecutive_failures,
      (array_agg(last_error ORDER BY last_attempt_at DESC NULLS LAST))[1] AS last_error FROM odds_refresh_targets rt
      WHERE rt.tournament_id IN (SELECT m.provider_entity_id FROM provider_entity_mappings m WHERE m.provider='ODDSPAPI' AND m.entity_type='COMPETITION' AND m.livasports_entity_id=c.id)) t ON true
    WHERE c.enabled GROUP BY c.id,c.slug,t.last_success_at,t.last_attempt_at,t.consecutive_failures,t.last_error`)).rows;
  const registry=new Set(FOOTBALL_COMPETITION_TARGETS.filter(t=>t.enabled).map(t=>t.slug));
  const inputs:CompetitionCoverageInput[]=rows.filter(r=>registry.has(String(r.competition))).map(r=>({
    competition:String(r.competition),tournamentId:r.tournament_id?String(r.tournament_id):null,nearestKickoff:r.nearest_kickoff?new Date(String(r.nearest_kickoff)).toISOString():null,
    lastSuccessAt:r.last_success_at?new Date(String(r.last_success_at)).toISOString():null,lastAttemptAt:r.last_attempt_at?new Date(String(r.last_attempt_at)).toISOString():null,
    consecutiveFailures:Number(r.consecutive_failures??0),lastError:r.last_error?String(r.last_error):null,
    windows:Object.fromEntries(COVERAGE_WINDOWS.map(k=>[k,{fixtures:Number(r[`${k}_fixtures`]),anyOdds:Number(r[`${k}_any`]),matchWinner:Number(r[`${k}_mw`]),totalGoals25:Number(r[`${k}_ou25`]),btts:Number(r[`${k}_btts`]),
      betanoReal:Number(r[`${k}_betano`]),betssonReal:Number(r[`${k}_betsson`]),bothReal:Number(r[`${k}_both`]),proxyOnly:Number(r[`${k}_proxy`]),neither:Number(r[`${k}_neither`]),staleOnly:Number(r[`${k}_stale`])}])) as Record<CoverageWindow,CoverageWindowCounts>,
  }));
  return assessCoverage(inputs,now);
}
