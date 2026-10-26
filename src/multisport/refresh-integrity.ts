import type {SportsSnapshot} from './model';
/** Only comparable source-cutoff metadata may advance an existing automatic publication. */
export function assertRefreshProgress(previous:SportsSnapshot|null, incoming:SportsSnapshot):void {
 if(!previous)return;
 if(previous.competitionId!==incoming.competitionId||previous.season!==incoming.season||previous.sourceId!==incoming.sourceId||previous.observationBasis!==incoming.observationBasis)throw Error('UPSTREAM_CONTEXT_CONFLICT');
 // ISO dates/timestamps are already validated at the repository boundary.
 if(Date.parse(incoming.observedAt)<Date.parse(previous.observedAt))throw Error('UPSTREAM_CUTOFF_REGRESSION');
}
