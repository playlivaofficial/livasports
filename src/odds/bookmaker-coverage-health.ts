import type {QueryExecutor} from '@/database/client';
import type {OddsComparison} from './types';

export interface BookmakerRealCoverage {
  betanoCurrentQuotes: number;
  betssonCurrentQuotes: number;
  betanoRealFixtures: number;
  betssonRealFixtures: number;
  bothRealFixtures: number;
  displayPairCount: number;
  proxyPairCount: number;
  identicalProxyPairCount: number;
}

export interface BookmakerCoverageHealth {
  realQuoteCoverageByBookmaker: {betano: number; betsson: number};
  proxyUsagePercentage: number;
  identicalProxyPairPercentage: number;
  abnormal: boolean;
  reasons: string[];
}

function isBetano(value:string){return value==='betano.bet.br';}
function isBetsson(value:string){return value==='betsson';}

export function coverageFromComparisons(comparisons:readonly OddsComparison[]):BookmakerRealCoverage {
  const betanoFixtures=new Set<number>();
  const betssonFixtures=new Set<number>();
  let betanoCurrentQuotes=0;
  let betssonCurrentQuotes=0;
  let displayPairCount=0;
  let proxyPairCount=0;
  let identicalProxyPairCount=0;
  comparisons.forEach((comparison,fixtureIndex)=>{
    const betano=comparison.rows.find(row=>isBetano(row.bookmaker));
    const betsson=comparison.rows.find(row=>isBetsson(row.bookmaker));
    if(!betano||!betsson)return;
    betano.cells.forEach((cell,index)=>{
      const other=betsson.cells[index];
      if(cell.priceKind==='REAL'&&cell.decimalOdds){betanoCurrentQuotes++;betanoFixtures.add(fixtureIndex);}
      if(other?.priceKind==='REAL'&&other.decimalOdds){betssonCurrentQuotes++;betssonFixtures.add(fixtureIndex);}
      if(!cell.decimalOdds||!other?.decimalOdds)return;
      displayPairCount++;
      const proxied=cell.priceKind==='PROXY'||other.priceKind==='PROXY';
      if(proxied)proxyPairCount++;
      if(proxied&&cell.decimalOdds===other.decimalOdds)identicalProxyPairCount++;
    });
  });
  return {
    betanoCurrentQuotes,betssonCurrentQuotes,
    betanoRealFixtures:betanoFixtures.size,betssonRealFixtures:betssonFixtures.size,
    bothRealFixtures:[...betanoFixtures].filter(id=>betssonFixtures.has(id)).length,
    displayPairCount,proxyPairCount,identicalProxyPairCount,
  };
}

export function coverageFromStoredPairs(pairs:readonly {fixtureId:string;betanoActive:boolean;betssonActive:boolean;betanoOdds:string|null;betssonOdds:string|null}[]):BookmakerRealCoverage {
  const betanoFixtures=new Set<string>();
  const betssonFixtures=new Set<string>();
  let betanoCurrentQuotes=0;
  let betssonCurrentQuotes=0;
  let displayPairCount=0;
  let proxyPairCount=0;
  let identicalProxyPairCount=0;
  pairs.forEach(pair=>{
    if(pair.betanoActive&&pair.betanoOdds){betanoCurrentQuotes++;betanoFixtures.add(pair.fixtureId);}
    if(pair.betssonActive&&pair.betssonOdds){betssonCurrentQuotes++;betssonFixtures.add(pair.fixtureId);}
    const betanoShown=pair.betanoActive&&pair.betanoOdds?pair.betanoOdds:pair.betssonActive&&pair.betssonOdds?pair.betssonOdds:null;
    const betssonShown=pair.betssonActive&&pair.betssonOdds?pair.betssonOdds:pair.betanoActive&&pair.betanoOdds?pair.betanoOdds:null;
    if(!betanoShown||!betssonShown)return;
    displayPairCount++;
    const proxied=!(pair.betanoActive&&pair.betanoOdds)||!(pair.betssonActive&&pair.betssonOdds);
    if(proxied)proxyPairCount++;
    if(proxied&&betanoShown===betssonShown)identicalProxyPairCount++;
  });
  return {
    betanoCurrentQuotes,betssonCurrentQuotes,
    betanoRealFixtures:betanoFixtures.size,betssonRealFixtures:betssonFixtures.size,
    bothRealFixtures:[...betanoFixtures].filter(id=>betssonFixtures.has(id)).length,
    displayPairCount,proxyPairCount,identicalProxyPairCount,
  };
}

export function bookmakerCoverageHealth(coverage:BookmakerRealCoverage):BookmakerCoverageHealth {
  const realQuoteCoverageByBookmaker={betano:coverage.betanoRealFixtures,betsson:coverage.betssonRealFixtures};
  const proxyUsagePercentage=coverage.displayPairCount?coverage.proxyPairCount/coverage.displayPairCount*100:0;
  const identicalProxyPairPercentage=coverage.displayPairCount?coverage.identicalProxyPairCount/coverage.displayPairCount*100:0;
  const reasons:string[]=[];
  const peer=Math.max(coverage.betanoRealFixtures,coverage.betssonRealFixtures);
  if(peer>=10){
    if(coverage.betanoRealFixtures===0||coverage.betanoRealFixtures/peer<0.1)reasons.push('BETANO_REAL_COVERAGE_COLLAPSE');
    if(coverage.betssonRealFixtures===0||coverage.betssonRealFixtures/peer<0.1)reasons.push('BETSSON_REAL_COVERAGE_COLLAPSE');
  }
  if(proxyUsagePercentage>80)reasons.push('PROXY_USAGE_DOMINANT');
  if(identicalProxyPairPercentage>80)reasons.push('IDENTICAL_DISPLAY_FROM_PROXY');
  return {realQuoteCoverageByBookmaker,proxyUsagePercentage,identicalProxyPairPercentage,abnormal:reasons.length>0,reasons};
}

export async function readBookmakerCoverageHealth(db:QueryExecutor):Promise<BookmakerCoverageHealth> {
  const pairRows=await db.query(`SELECT f.id::text AS fixture_id,
      max(o.decimal_odds::text) FILTER (WHERE b.provider_slug='betano.bet.br' AND o.status='ACTIVE') AS betano_odds,
      max(o.decimal_odds::text) FILTER (WHERE b.provider_slug='betsson' AND o.status='ACTIVE') AS betsson_odds,
      bool_or(b.provider_slug='betano.bet.br' AND o.status='ACTIVE') AS betano_active,
      bool_or(b.provider_slug='betsson' AND o.status='ACTIVE') AS betsson_active
    FROM fixtures f
    JOIN odds_current o ON o.fixture_id=f.id AND o.market_code='MATCH_WINNER' AND o.line IS NULL
      AND o.scope='FULL_TIME_REGULATION' AND o.phase='PREGAME'
    JOIN bookmakers b ON b.id=o.bookmaker_id
    WHERE f.status='SCHEDULED' AND f.kickoff>now() AND b.provider_slug IN ('betano.bet.br','betsson')
    GROUP BY f.id, o.outcome_code`);
  return bookmakerCoverageHealth(coverageFromStoredPairs(pairRows.rows.map(row=>({
    fixtureId:String(row.fixture_id),
    betanoActive:row.betano_active===true,
    betssonActive:row.betsson_active===true,
    betanoOdds:typeof row.betano_odds==='string'?row.betano_odds:null,
    betssonOdds:typeof row.betsson_odds==='string'?row.betsson_odds:null,
  }))));
}

