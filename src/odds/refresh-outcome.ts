import type {OddsSnapshot} from './types';
import type {SnapshotMatch} from './native-diagnostics';

export type RefreshOutcome='NATIVE_PERSISTED'|'VALID_EMPTY'|'PROVIDER_EMPTY'|'MAPPING_EMPTY'|'PARSER_EMPTY';
/** Per-target evidence; prices belonging to another member of a batch never count as success here. */
export function refreshOutcomes(snapshot:OddsSnapshot,matches:readonly SnapshotMatch[],expectedTournamentIds:ReadonlySet<string>){
  return [...new Set(snapshot.tournamentIds)].map(tournamentId=>{
    const returned=matches.filter(m=>m.raw.providerCompetitionId===tournamentId);
    const upcoming=returned.filter(m=>m.raw.status==='PREGAME'&&Date.parse(m.raw.kickoff)>Date.parse(snapshot.observedAt)&&Date.parse(m.raw.kickoff)<=Date.parse(snapshot.observedAt)+7*86400000);
    const mapped=upcoming.filter(m=>m.fixture?.status==='SCHEDULED'&&Date.parse(m.fixture.kickoff)>Date.parse(snapshot.observedAt));
    const ids=new Set(mapped.map(m=>m.raw.providerId));
    const quotes=snapshot.quotes.filter(q=>ids.has(q.providerFixtureId));
    const active=quotes.filter(q=>q.status==='ACTIVE').length;
    const invalid=snapshot.diagnostics?.filter(d=>d.tournamentId===tournamentId&&!d.reason.startsWith('OUT_OF_SCOPE')).length??0;
    const outcome:RefreshOutcome=active?'NATIVE_PERSISTED':invalid?'PARSER_EMPTY':upcoming.length&&!mapped.length?'MAPPING_EMPTY':
      quotes.length&&quotes.every(q=>['SUSPENDED','WITHDRAWN','CLOSED'].includes(q.status))?'VALID_EMPTY':
      !expectedTournamentIds.has(tournamentId)&&!upcoming.length?'VALID_EMPTY':'PROVIDER_EMPTY';
    return {tournamentId,outcome,returnedFixtures:returned.length,upcomingFixtures:upcoming.length,mappedFixtures:mapped.length,unmappedFixtures:upcoming.length-mapped.length,
      nativeSelections:active,normalizedSelections:quotes.length,rejected:invalid,
      meaningful:outcome==='NATIVE_PERSISTED'||outcome==='VALID_EMPTY'};
  });
}
