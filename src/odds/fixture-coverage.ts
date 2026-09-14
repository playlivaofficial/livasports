import type {QueryExecutor} from '@/database/client';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {KICKOFF_TOLERANCE_MS, type CanonicalOddsFixture, type OddsSnapshot, type ProviderOddsFixture} from './types';
import {matchOddsFixture} from './matching';
import {unmappedFixtureReason} from './coverage-matrix';
import {resolveCatalogTournaments, schedulerTournaments} from '@/providers/oddspapi/tournament-catalog';

export const COVERAGE_STATUSES=[
  'PROVIDER_FIXTURE_ABSENT',
  'TOURNAMENT_NOT_ACTIVE',
  'FIXTURE_MAPPING_MISSING',
  'TEAM_ALIAS_MISMATCH',
  'KICKOFF_MISMATCH',
  'READ_MODEL_DROPPED_QUOTE',
  'QUOTE_STALE',
  'BOOKMAKER_DOES_NOT_PRICE_FIXTURE',
  'MARKET_UNAVAILABLE',
  'CURRENT_ODDS_AVAILABLE',
  'WITHDRAWN',
  'OTHER_VERIFIED_REASON',
] as const;
export type CoverageStatus=typeof COVERAGE_STATUSES[number];
export type MarketCoverage='AVAILABLE'|'ABSENT'|'STALE'|'WITHDRAWN'|'UNAVAILABLE';
export const ODDS_INGEST_WINDOW_MS=45*24*60*60*1000;
const INTERNAL_BUGS=new Set<CoverageStatus>(['FIXTURE_MAPPING_MISSING','TEAM_ALIAS_MISMATCH','KICKOFF_MISMATCH','READ_MODEL_DROPPED_QUOTE']);

export interface MarketFlags {
  stored:boolean;
  listingCurrent:boolean;
  stale:boolean;
  withdrawn:boolean;
  dropped:boolean;
}

export interface FixtureCoverageInput {
  publicId:string;
  competition:string;
  slug:string;
  kickoff:string;
  home:string;
  away:string;
  tournamentId:string|null;
  schedulerEnabled:boolean;
  now:number;
  providerFixtures:readonly ProviderOddsFixture[];
  providerHorizon:string|null;
  mapped:boolean;
  matchWinner:Record<'betano'|'betsson',MarketFlags>;
  totalGoals25:Record<'betano'|'betsson',MarketFlags>;
  btts:Record<'betano'|'betsson',MarketFlags>;
}

export interface FixtureCoverageRow {
  publicId:string;
  competition:string;
  slug:string;
  kickoff:string;
  home:string;
  away:string;
  oddspapiTournamentId:string|null;
  providerFixturePresent:boolean;
  strictMappingPresent:boolean;
  betanoCurrentQuote:boolean;
  betssonCurrentQuote:boolean;
  matchWinner:MarketCoverage;
  totalGoals25:MarketCoverage;
  btts:MarketCoverage;
  classification:CoverageStatus;
  evidence:string;
  internalBug:boolean;
}

function anyFlag(books:Record<'betano'|'betsson',MarketFlags>,key:keyof MarketFlags):boolean {
  return books.betano[key]||books.betsson[key];
}

export function marketCoverage(flags:MarketFlags):MarketCoverage {
  if(flags.listingCurrent)return 'AVAILABLE';
  if(flags.dropped)return 'UNAVAILABLE';
  if(flags.stale)return 'STALE';
  if(flags.withdrawn)return 'WITHDRAWN';
  if(flags.stored)return 'UNAVAILABLE';
  return 'ABSENT';
}

function combineMarket(books:Record<'betano'|'betsson',MarketFlags>):MarketCoverage {
  const states=[marketCoverage(books.betano),marketCoverage(books.betsson)];
  if(states.includes('AVAILABLE'))return 'AVAILABLE';
  if(states.includes('UNAVAILABLE')&&(books.betano.dropped||books.betsson.dropped))return 'UNAVAILABLE';
  if(states.includes('STALE'))return 'STALE';
  if(states.includes('WITHDRAWN'))return 'WITHDRAWN';
  if(states.includes('UNAVAILABLE'))return 'UNAVAILABLE';
  return 'ABSENT';
}

function emptyFlags():MarketFlags {
  return {stored:false,listingCurrent:false,stale:false,withdrawn:false,dropped:false};
}

export function classifyFixtureCoverage(input:FixtureCoverageInput):FixtureCoverageRow {
  const canonical:CanonicalOddsFixture={
    id:input.publicId,competitionId:'',sport:'FOOTBALL',competition:input.slug,kickoff:input.kickoff,
    status:'SCHEDULED',homeId:'',home:input.home,awayId:'',away:input.away,
  };
  const providerPool=input.providerFixtures.filter(row=>row.competition===input.slug);
  const gap=input.mapped?null:unmappedFixtureReason(canonical,providerPool);
  const matched=providerPool.map(raw=>({raw,match:matchOddsFixture(raw,[canonical],[])})).find(row=>row.match.fixture);
  const present=!!matched||(gap!==null&&gap!=='provider fixture absent');
  const outsideIngest=Number.isFinite(Date.parse(input.kickoff))&&Date.parse(input.kickoff)>input.now+ODDS_INGEST_WINDOW_MS;
  const outsideHorizon=input.providerHorizon!=null&&Number.isFinite(Date.parse(input.kickoff))
    && Date.parse(input.kickoff)>Date.parse(input.providerHorizon)+KICKOFF_TOLERANCE_MS;
  const mw=combineMarket(input.matchWinner);
  const ou=combineMarket(input.totalGoals25);
  const btts=combineMarket(input.btts);
  const anyDropped=anyFlag(input.matchWinner,'dropped')||anyFlag(input.totalGoals25,'dropped')||anyFlag(input.btts,'dropped');
  const anyStale=anyFlag(input.matchWinner,'stale')||anyFlag(input.totalGoals25,'stale')||anyFlag(input.btts,'stale');
  const anyWithdrawn=anyFlag(input.matchWinner,'withdrawn')||anyFlag(input.totalGoals25,'withdrawn')||anyFlag(input.btts,'withdrawn');
  const anyStored=anyFlag(input.matchWinner,'stored')||anyFlag(input.totalGoals25,'stored')||anyFlag(input.btts,'stored');
  let classification:CoverageStatus;
  let evidence:string;
  if(anyFlag(input.matchWinner,'listingCurrent')){
    classification='CURRENT_ODDS_AVAILABLE';
    evidence='At least one verified bookmaker has a current MATCH_WINNER quote on the listing read model';
  }else if(anyDropped){
    classification='READ_MODEL_DROPPED_QUOTE';
    evidence='odds_current has a quote that the listing read model rejects (mapping_verified/geo/source)';
  }else if(anyStale){
    classification='QUOTE_STALE';
    evidence='Stored quote is past freshness TTL or otherwise not CURRENT';
  }else if(anyWithdrawn){
    classification='WITHDRAWN';
    evidence='Stored quote status is SUSPENDED, CLOSED, or WITHDRAWN';
  }else if(input.mapped&&anyStored&&mw==='ABSENT'){
    classification='MARKET_UNAVAILABLE';
    evidence='Fixture is mapped and other markets exist, but MATCH_WINNER is not currently priced';
  }else if(input.mapped&&!anyStored){
    classification='BOOKMAKER_DOES_NOT_PRICE_FIXTURE';
    evidence='Strict mapping exists, but odds_current has no quotes for this fixture';
  }else if(!input.tournamentId){
    classification='OTHER_VERIFIED_REASON';
    evidence='No unique OddsPapi tournament identity in the verified catalog';
  }else if(!input.schedulerEnabled){
    classification='TOURNAMENT_NOT_ACTIVE';
    evidence=`Catalog tournament ${input.tournamentId} is not on the scheduler allowlist`;
  }else if(outsideHorizon&&!matched){
    classification='PROVIDER_FIXTURE_ABSENT';
    evidence=`Outside provider snapshot horizon (latest provider kickoff ${input.providerHorizon})`;
  }else if(outsideIngest&&!present){
    classification='PROVIDER_FIXTURE_ABSENT';
    evidence='Outside the 45-day odds ingest window and absent from the latest provider snapshot';
  }else if(matched&&!input.mapped){
    classification='FIXTURE_MAPPING_MISSING';
    evidence=`Provider fixture ${matched.raw.providerId} is ${matched.match.state} but no persisted mapping`;
  }else if(gap==='team mismatch'){
    classification='TEAM_ALIAS_MISMATCH';
    evidence='Provider fixture is near kickoff with one team overlapping, but home/away aliases do not match';
  }else if(gap==='kickoff mismatch'){
    classification='KICKOFF_MISMATCH';
    evidence='Provider fixture names match, but kickoff differs by more than ten minutes';
  }else if(gap==='duplicate candidate'||gap==='mapping missing for another reason'){
    classification='FIXTURE_MAPPING_MISSING';
    evidence=gap==='duplicate candidate'?'Multiple provider fixtures claim the same canonical identity':'Provider identity matches but mapping was not persisted';
  }else{
    classification='PROVIDER_FIXTURE_ABSENT';
    evidence=input.providerHorizon
      ?'OddsPapi snapshot for this tournament does not include this fixture'
      :'No applied OddsPapi snapshot fixtures for this tournament';
  }
  return {
    publicId:input.publicId,
    competition:input.competition,
    slug:input.slug,
    kickoff:input.kickoff,
    home:input.home,
    away:input.away,
    oddspapiTournamentId:input.tournamentId,
    providerFixturePresent:present||!!matched,
    strictMappingPresent:input.mapped,
    betanoCurrentQuote:input.matchWinner.betano.listingCurrent,
    betssonCurrentQuote:input.matchWinner.betsson.listingCurrent,
    matchWinner:mw,
    totalGoals25:ou,
    btts,
    classification,
    evidence,
    internalBug:INTERNAL_BUGS.has(classification),
  };
}

type QuoteRow={
  fixture_id:string;
  bookmaker:string;
  market:string;
  status:string;
  listing_current:boolean;
  stale:boolean;
  withdrawn:boolean;
  dropped:boolean;
};

function flagsFromQuotes(quotes:readonly QuoteRow[],bookmaker:string,market:string):MarketFlags {
  const rows=quotes.filter(row=>row.bookmaker===bookmaker&&row.market===market);
  if(!rows.length)return emptyFlags();
  return {
    stored:true,
    listingCurrent:rows.some(row=>row.listing_current),
    stale:rows.some(row=>row.stale)&&!rows.some(row=>row.listing_current),
    withdrawn:rows.some(row=>row.withdrawn)&&!rows.some(row=>row.listing_current||row.stale),
    dropped:rows.some(row=>row.dropped)&&!rows.some(row=>row.listing_current),
  };
}

export interface CompetitionCoverageSummary {
  competition:string;
  slug:string;
  upcoming:number;
  providerFixturesPresent:number;
  mapped:number;
  betanoMw:number;
  betssonMw:number;
  totalGoals25:number;
  btts:number;
  providerAbsent:number;
  mappingBugs:number;
  readModelBugs:number;
  stale:number;
  other:number;
}

export interface FixtureCoverageReport {
  at:string;
  providerRequests:0;
  liveOddsCoverage:'PLAN-BLOCKED';
  unexplained:number;
  totals:{
    upcoming:number;
    oddsAvailable:number;
    providerAbsent:number;
    tournamentNotActive:number;
    mappingBugs:number;
    readModelBugs:number;
    stale:number;
    other:number;
    internalBugs:number;
  };
  competitions:CompetitionCoverageSummary[];
  fixtures:FixtureCoverageRow[];
}

function iso(value:unknown):string {
  return value instanceof Date?value.toISOString():String(value);
}

export async function buildFixtureCoverageReport(db:QueryExecutor,now=Date.now()):Promise<FixtureCoverageReport> {
  const [catalogRow,competitions,quotes,snapshots]=await Promise.all([
    db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'"),
    db.query(`SELECT f.id, f.public_id, f.kickoff, f.status, c.slug, c.name AS competition,
        ht.name AS home, at.name AS away,
        EXISTS(SELECT 1 FROM odds_mapping_reviews mr WHERE mr.fixture_id=f.id AND mr.state IN ('EXACT','HIGH_CONFIDENCE')) AS mapped
      FROM fixtures f
      JOIN competitions c ON c.id=f.competition_id AND c.enabled
      JOIN teams ht ON ht.id=f.home_team_id
      JOIN teams at ON at.id=f.away_team_id
      WHERE f.status='SCHEDULED' AND f.kickoff>now()
      ORDER BY c.name, f.kickoff`),
    db.query(`SELECT o.fixture_id,
        CASE WHEN b.provider_slug='betano.bet.br' THEN 'betano' WHEN b.provider_slug='betsson' THEN 'betsson' ELSE b.provider_slug END AS bookmaker,
        o.market_code AS market, o.status,
        o.status='ACTIVE'
          AND mr.state IN ('EXACT','HIGH_CONFIDENCE')
          AND (fm.metadata->>'canonicalKickoff')::timestamptz=f.kickoff
          AND o.scope='FULL_TIME_REGULATION' AND o.phase='PREGAME'
          AND now()-o.observed_at < make_interval(mins => COALESCE(o.freshness_ttl_minutes, 15)::int)
          AS listing_current,
        o.status='ACTIVE' AND now()-o.observed_at >= make_interval(mins => COALESCE(o.freshness_ttl_minutes, 15)::int) AS stale,
        o.status IN ('SUSPENDED','CLOSED') AS withdrawn,
        o.status='ACTIVE' AND NOT (
          mr.state IN ('EXACT','HIGH_CONFIDENCE') AND (fm.metadata->>'canonicalKickoff')::timestamptz=f.kickoff
        ) AS dropped
      FROM odds_current o
      JOIN fixtures f ON f.id=o.fixture_id AND f.status='SCHEDULED' AND f.kickoff>now()
      JOIN bookmakers b ON b.id=o.bookmaker_id
      LEFT JOIN provider_entity_mappings fm ON fm.provider='ODDSPAPI' AND fm.entity_type='FIXTURE' AND fm.provider_entity_id=o.provider_fixture_id
      LEFT JOIN odds_mapping_reviews mr ON mr.provider_fixture_id=o.provider_fixture_id
      WHERE b.provider_slug IN ('betano.bet.br','betsson')`),
    db.query(`SELECT DISTINCT ON (bookmaker, tid) bookmaker, tid AS tournament_id, observed_at, payload
      FROM odds_sync_snapshots s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.payload->'tournamentIds') AS tid
      WHERE s.applied_at IS NOT NULL
      ORDER BY bookmaker, tid, observed_at DESC`),
  ]);
  const catalog=catalogRow.rows[0];
  const resolved=resolveCatalogTournaments(catalog?.tournaments??[]);
  const scheduled=schedulerTournaments(catalog?.tournaments??[]);
  const byCanonical=new Map(resolved.map(row=>[row.canonical,row]));
  const scheduledIds=new Set(scheduled.map(row=>row.id));
  const providerBySlug=new Map<string,ProviderOddsFixture[]>();
  const horizonBySlug=new Map<string,number>();
  for(const row of snapshots.rows){
    const payload=row.payload as OddsSnapshot;
    for(const fixture of payload.fixtures??[]){
      if(!fixture.competition)continue;
      const list=providerBySlug.get(fixture.competition)??[];
      list.push(fixture);
      providerBySlug.set(fixture.competition,list);
      const kick=Date.parse(fixture.kickoff);
      if(Number.isFinite(kick))horizonBySlug.set(fixture.competition,Math.max(horizonBySlug.get(fixture.competition)??0,kick));
    }
  }
  const quotesByFixture=new Map<string,QuoteRow[]>();
  for(const row of quotes.rows as QuoteRow[]){
    const list=quotesByFixture.get(row.fixture_id)??[];
    list.push(row);
    quotesByFixture.set(row.fixture_id,list);
  }
  const fixtures:FixtureCoverageRow[]=[];
  for(const row of competitions.rows){
    const slug=String(row.slug);
    const tournament=byCanonical.get(slug);
    const schedulerEnabled=tournament?scheduledIds.has(tournament.id):false;
    const providerFixtures=providerBySlug.get(slug)??[];
    const horizon=horizonBySlug.get(slug);
    const fixtureQuotes=quotesByFixture.get(String(row.id))??[];
    fixtures.push(classifyFixtureCoverage({
      publicId:String(row.public_id),
      competition:String(row.competition),
      slug,
      kickoff:iso(row.kickoff),
      home:String(row.home),
      away:String(row.away),
      tournamentId:tournament?.id??null,
      schedulerEnabled,
      now,
      providerFixtures,
      providerHorizon:horizon?new Date(horizon).toISOString():null,
      mapped:Boolean(row.mapped),
      matchWinner:{betano:flagsFromQuotes(fixtureQuotes,'betano','MATCH_WINNER'),betsson:flagsFromQuotes(fixtureQuotes,'betsson','MATCH_WINNER')},
      totalGoals25:{betano:flagsFromQuotes(fixtureQuotes,'betano','TOTAL_GOALS'),betsson:flagsFromQuotes(fixtureQuotes,'betsson','TOTAL_GOALS')},
      btts:{betano:flagsFromQuotes(fixtureQuotes,'betano','BTTS'),betsson:flagsFromQuotes(fixtureQuotes,'betsson','BTTS')},
    }));
  }
  const enabled=new Set(FOOTBALL_COMPETITION_TARGETS.filter(target=>target.enabled).map(target=>target.slug));
  const bySlug=new Map<string,CompetitionCoverageSummary>();
  for(const slug of enabled){
    const name=fixtures.find(row=>row.slug===slug)?.competition??FOOTBALL_COMPETITION_TARGETS.find(target=>target.slug===slug)?.canonicalName??slug;
    bySlug.set(slug,{competition:name,slug,upcoming:0,providerFixturesPresent:0,mapped:0,betanoMw:0,betssonMw:0,totalGoals25:0,btts:0,providerAbsent:0,mappingBugs:0,readModelBugs:0,stale:0,other:0});
  }
  for(const row of fixtures){
    const summary=bySlug.get(row.slug)??{competition:row.competition,slug:row.slug,upcoming:0,providerFixturesPresent:0,mapped:0,betanoMw:0,betssonMw:0,totalGoals25:0,btts:0,providerAbsent:0,mappingBugs:0,readModelBugs:0,stale:0,other:0};
    summary.upcoming++;
    if(row.providerFixturePresent)summary.providerFixturesPresent++;
    if(row.strictMappingPresent)summary.mapped++;
    if(row.betanoCurrentQuote)summary.betanoMw++;
    if(row.betssonCurrentQuote)summary.betssonMw++;
    if(row.totalGoals25==='AVAILABLE')summary.totalGoals25++;
    if(row.btts==='AVAILABLE')summary.btts++;
    if(row.classification==='PROVIDER_FIXTURE_ABSENT')summary.providerAbsent++;
    else if(row.classification==='FIXTURE_MAPPING_MISSING'||row.classification==='TEAM_ALIAS_MISMATCH'||row.classification==='KICKOFF_MISMATCH')summary.mappingBugs++;
    else if(row.classification==='READ_MODEL_DROPPED_QUOTE')summary.readModelBugs++;
    else if(row.classification==='QUOTE_STALE')summary.stale++;
    else if(row.classification!=='CURRENT_ODDS_AVAILABLE')summary.other++;
    bySlug.set(row.slug,summary);
  }
  const competitionsSummary=[...bySlug.values()].sort((a,b)=>a.competition.localeCompare(b.competition));
  const unexplained=fixtures.filter(row=>!COVERAGE_STATUSES.includes(row.classification)).length;
  return {
    at:new Date(now).toISOString(),
    providerRequests:0,
    liveOddsCoverage:'PLAN-BLOCKED',
    unexplained,
    totals:{
      upcoming:fixtures.length,
      oddsAvailable:fixtures.filter(row=>row.classification==='CURRENT_ODDS_AVAILABLE').length,
      providerAbsent:fixtures.filter(row=>row.classification==='PROVIDER_FIXTURE_ABSENT').length,
      tournamentNotActive:fixtures.filter(row=>row.classification==='TOURNAMENT_NOT_ACTIVE').length,
      mappingBugs:fixtures.filter(row=>row.classification==='FIXTURE_MAPPING_MISSING'||row.classification==='TEAM_ALIAS_MISMATCH'||row.classification==='KICKOFF_MISMATCH').length,
      readModelBugs:fixtures.filter(row=>row.classification==='READ_MODEL_DROPPED_QUOTE').length,
      stale:fixtures.filter(row=>row.classification==='QUOTE_STALE').length,
      other:fixtures.filter(row=>!['CURRENT_ODDS_AVAILABLE','PROVIDER_FIXTURE_ABSENT','TOURNAMENT_NOT_ACTIVE','FIXTURE_MAPPING_MISSING','TEAM_ALIAS_MISMATCH','KICKOFF_MISMATCH','READ_MODEL_DROPPED_QUOTE','QUOTE_STALE'].includes(row.classification)).length,
      internalBugs:fixtures.filter(row=>row.internalBug).length,
    },
    competitions:competitionsSummary,
    fixtures,
  };
}
