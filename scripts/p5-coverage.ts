import {readFile,writeFile} from 'node:fs/promises';
import {normalizeM5Snapshot,M5_TOURNAMENTS,M5_EXPANDED_TOURNAMENTS,inspectM5OfferFlags} from '../src/providers/oddspapi/m5-normalizer';
import {SOURCE_BOOKMAKER_IDS,VISIBLE_BOOKMAKERS} from '../src/odds/registry';
import {SELECTIONS} from '../src/odds/types';
const samples=await Promise.all(SOURCE_BOOKMAKER_IDS.map(async book=>{
  const raw=JSON.parse(await readFile(`output/p5-canary-${book}.json`,'utf8'));
  return {book,flags:inspectM5OfferFlags(raw.data,book),snapshot:normalizeM5Snapshot(raw.data,book,raw.at,raw.query.tournamentIds.split(','),[...M5_TOURNAMENTS,...M5_EXPANDED_TOURNAMENTS])};
}));
const at=Math.max(...samples.map(s=>Date.parse(s.snapshot.observedAt)));
const windows=[24,72,168].map(hours=>{
  const ids=new Set(samples.flatMap(s=>s.snapshot.fixtures.filter(f=>f.status==='PREGAME'&&Date.parse(f.kickoff)>at&&Date.parse(f.kickoff)<=at+hours*3600000).map(f=>f.providerId)));
  const coverage=samples.map(({book,snapshot})=>{
    const quotes=snapshot.quotes.filter(q=>ids.has(q.providerFixtureId));
    const active=quotes.filter(q=>q.status==='ACTIVE');
    return {book,fixtures:new Set(quotes.map(q=>q.providerFixtureId)).size,currentFixtures:new Set(active.map(q=>q.providerFixtureId)).size,
      markets:Object.fromEntries(Object.entries(SELECTIONS).map(([market,outcomes])=>[market,[...ids].filter(id=>outcomes.every(outcome=>active.some(q=>q.providerFixtureId===id&&q.market===market&&q.outcome===outcome))).length])),
      statuses:quotes.reduce<Record<string,number>>((r,q)=>({...r,[q.status]:(r[q.status]??0)+1}),{}),domains:[...new Set(active.map(q=>q.sourceDomain))]};
  });
  const realCounts=[...ids].map(id=>VISIBLE_BOOKMAKERS.filter(b=>samples.find(s=>s.book===b.canonicalId)!.snapshot.quotes.some(q=>q.providerFixtureId===id&&q.status==='ACTIVE')).length);
  return {hours,unionFixtures:ids.size,coverage,visibleRealFixtures:{three:realCounts.filter(n=>n===3).length,two:realCounts.filter(n=>n===2).length,one:realCounts.filter(n=>n===1).length,none:realCounts.filter(n=>n===0).length}};
});
const report={at:new Date(at).toISOString(),scope:'Bounded four-tournament canary; not full production coverage. Current means active quote freshly observed at sample time; changedAt is a last-price-change timestamp.',tournaments:['325','390','27464','17'],windows,flags:samples.map(s=>({book:s.book,...s.flags,rejected:s.snapshot.rejected}))};
await writeFile('output/p5-canary-coverage.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
