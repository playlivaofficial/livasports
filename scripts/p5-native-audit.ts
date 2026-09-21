/** Read-only P5 pipeline audit. Reuses saved responses; never calls a provider. */
import {readFile,writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {canonicalFixtures} from '../src/odds/ingestion';
import {matchOddsFixture} from '../src/odds/matching';
import {readListingOddsSnapshots} from '../src/odds/read-core';
import {buildComparison,quoteState} from '../src/odds/comparison';
import {normalizeM5Snapshot,M5_TOURNAMENTS,M5_EXPANDED_TOURNAMENTS} from '../src/providers/oddspapi/m5-normalizer';
import type {OddsSnapshot,PersistedFixtureMapping} from '../src/odds/types';
const db=new PostgresDatabaseClient(databaseUrl()!);
const books=['sportingbet.bet.br','betboo.bet.br'];
try{
  const now=Date.now(),fixtures=await canonicalFixtures(db);
  const saved=(await db.query(`SELECT provider_entity_id AS "providerId",livasports_entity_id AS "fixtureId",metadata->>'homeProviderId' AS "homeProviderId",metadata->>'awayProviderId' AS "awayProviderId",metadata->>'canonicalKickoff' AS "canonicalKickoff",metadata->>'providerKickoff' AS "providerKickoff" FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE'`)).rows as PersistedFixtureMapping[];
  const snapshots=(await db.query(`SELECT DISTINCT ON(bookmaker,payload->>'tournamentIds') bookmaker,payload,applied_at FROM odds_sync_snapshots WHERE bookmaker=ANY($1::text[]) AND observed_at>now()-interval '2 days' ORDER BY bookmaker,payload->>'tournamentIds',observed_at DESC`,[books])).rows;
  const reads=await readListingOddsSnapshots(db,fixtures.filter(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>now&&Date.parse(f.kickoff)<now+7*86400000).map(f=>f.id),null,true);
  const pipelines=snapshots.map(row=>{
    const s=row.payload as OddsSnapshot;
    return {bookmaker:s.bookmaker,tournaments:s.tournamentIds,observedAt:s.observedAt,applied:!!row.applied_at,rejected:s.rejected,fixtures:s.fixtures.map(raw=>{
      const match=matchOddsFixture(raw,fixtures,saved),read=match.fixture?reads.get(match.fixture.id):null;
      const quotes=s.quotes.filter(q=>q.providerFixtureId===raw.providerId);
      const stored=read?.quotes.filter(q=>q.bookmaker===s.bookmaker)??[];
      const selected=read?buildComparison(read,'MATCH_WINNER',now).rows.find(r=>r.bookmaker===s.bookmaker):null;
      return {id:raw.providerId,competition:raw.competition,home:raw.homeNames[0],away:raw.awayNames[0],kickoff:raw.kickoff,match:match.state,reason:match.reason,
        inUpcomingWindow:!!read,normalized:quotes.length,active:quotes.filter(q=>q.status==='ACTIVE').length,suspended:quotes.filter(q=>q.status==='SUSPENDED').length,
        matchWinner:quotes.filter(q=>q.market==='MATCH_WINNER').length,persisted:stored.length,
        missingPersisted:read?quotes.filter(q=>!stored.some(p=>p.market===q.market&&p.outcome===q.outcome&&p.line===q.line)).length:null,
        storedStates:stored.map(q=>({market:q.market,outcome:q.outcome,status:q.status,current:quoteState(q,read!,now),eligible:q.geoEligible,observedAt:q.observedAt})),
        resolved1X2:selected?.cells.map(c=>({outcome:c.outcome,kind:c.priceKind,source:c.sourceBookmaker,price:c.decimalOdds}))??[]};
    })};
  });
  const cached=[];
  for(const book of books){
    const raw=JSON.parse(await readFile(`output/p5-canary-${book}.json`,'utf8'));
    const s=normalizeM5Snapshot(raw.data,book,raw.at,raw.query.tournamentIds.split(','),[...M5_TOURNAMENTS,...M5_EXPANDED_TOURNAMENTS]);
    cached.push({book,at:raw.at,tournaments:s.tournamentIds,fixtures:s.fixtures.length,rejected:s.rejected,
      markets:['MATCH_WINNER','TOTAL_GOALS','BTTS'].map(m=>({market:m,quotes:s.quotes.filter(q=>q.market===m).length,active:s.quotes.filter(q=>q.market===m&&q.status==='ACTIVE').length})),
      serieB:raw.data.filter((r:{tournamentId:number})=>r.tournamentId===390).map((r:{fixtureId:string;bookmakerOdds:Record<string,{bookmakerIsActive:boolean;suspended:boolean;markets:Record<string,unknown>}>})=>({id:r.fixtureId,active:r.bookmakerOdds[book].bookmakerIsActive,suspended:r.bookmakerOdds[book].suspended,supportedMarketIds:Object.keys(r.bookmakerOdds[book].markets).filter(id=>['101','104','1010'].includes(id))}))});
  }
  const candidates=fixtures.filter(f=>/goi|ceuta|sociedad/i.test(`${f.home} ${f.away}`)).map(f=>({id:f.id,home:f.home,away:f.away,competition:f.competition,kickoff:f.kickoff}));
  const report={at:new Date(now).toISOString(),providerRequests:0,cached,pipelines,candidates};
  await writeFile('output/p5-native-audit-private.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({at:report.at,providerRequests:0,snapshots:pipelines.length,cached,
    summary:pipelines.map(p=>({bookmaker:p.bookmaker,tournaments:p.tournaments,observedAt:p.observedAt,applied:p.applied,returned:p.fixtures.length,matched:p.fixtures.filter(f=>f.match==='EXACT'||f.match==='HIGH_CONFIDENCE').length,missingPersisted:p.fixtures.reduce((n,f)=>n+(f.missingPersisted??0),0),unmatched:p.fixtures.filter(f=>f.match!=='EXACT'&&f.match!=='HIGH_CONFIDENCE').map(f=>({home:f.home,away:f.away,reason:f.reason}))}))}));
}catch(error){console.error(JSON.stringify({error:error instanceof Error?error.name:'AUDIT_FAILED'}));process.exitCode=1;}finally{await db.close();}
