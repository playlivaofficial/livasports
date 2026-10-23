import type {SportsSnapshot} from './model';
/** Pure helper shared by the private client editor; no database or provider imports. */
export function snapshotKey(snapshot:Pick<SportsSnapshot,'competitionId'|'season'>){return `${snapshot.competitionId}:${snapshot.season}`;}
