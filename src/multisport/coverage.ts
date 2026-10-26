import {competitions, type Competition} from './catalog';
import {snapshotFreshness, validateSnapshot, type SportsSnapshot} from './model';
import {orderSportsSnapshots} from './ordering';
import type {RefreshState, SnapshotRecord} from './repository';
import {SPORTS_SOURCES, isApprovedSourceForCompetition} from './sources';
import {WIKIMEDIA_DATASETS} from './wikimedia-datasets';
import {tr, translated} from './translation';
import type {InterfaceLocale} from '@/localization/interface';

export type CoverageState = 'current-verified' | 'dated-snapshot' | 'historical-archive' | 'awaiting-publication' | 'unavailable-source' | 'rights-blocked';
const labels = {
 'current-verified': tr('Recent verified snapshot · not live','Registro verificado reciente · no en vivo','Registro verificado recente · não ao vivo'),
 'dated-snapshot': tr('Dated snapshot · check source cutoff','Registro fechado · consulta el corte','Registro datado · confira a data'),
 'historical-archive': tr('Historical archive','Archivo histórico','Arquivo histórico'),
 'awaiting-publication': tr('Reviewed data awaiting publication','Datos revisados pendientes de publicación','Dados revisados aguardando publicação'),
 'unavailable-source': tr('No verified data published','Sin datos verificados publicados','Sem dados verificados publicados'),
 'rights-blocked': tr('Source permission not established','Permiso de fuente no confirmado','Permissão da fonte não confirmada'),
};
export const coverageLabel = (state:CoverageState, locale:InterfaceLocale) => translated(labels[state],locale);

/** Publication age comes ONLY from source data, never retrieval or a successful job. */
export function publishedCoverage(snapshot:SportsSnapshot, now = new Date()):CoverageState {
 const freshness = snapshotFreshness(snapshot,now);
 if (freshness.status === 'historical') return 'historical-archive';
 return freshness.status === 'fresh' ? 'current-verified' : 'dated-snapshot';
}

function sourcePermission(competition:Competition):'approved'|'not-established' {
 if (competition.id==='bundesliga' && SPORTS_SOURCES.openligadb.status==='approved') return 'approved';
 const wiki = WIKIMEDIA_DATASETS.find(s=>s.competitionId===competition.id);
 if (wiki && isApprovedSourceForCompetition('wikimedia',competition.id,competition.sport,wiki.sourceUrl,wiki.season)) return 'approved';
 return Object.keys(SPORTS_SOURCES).some(id=>isApprovedSourceForCompetition(id,competition.id,competition.sport,competition.sourceUrl,competition.season??undefined)) ? 'approved' : 'not-established';
}
export interface OperationalCoverage {
 competitionId:string; name:string; sport:string; state:CoverageState;
 sourcePermission:'approved'|'not-established'; sourceId:string|null;
 season:string|null; observedAt:string|null; observationBasis:string|null; retrievedAt:string|null;
 ageHours:number|null; entities:number; tableRows:number; events:number;
 candidateReviewed:boolean; candidateRevision:number|null; archivedRecords:number;
 refresh:{enabled:boolean;eligible:boolean;lastAttemptAt:string|null;lastSuccessAt:string|null;lastFailureAt:string|null;lastError:string|null;nextAllowedAt:string|null;failures:number;attention:boolean};
}
/** Private operational projection, built from the current DB response. No draft text or lease secrets. */
export function operationalCoverage(records:readonly SnapshotRecord[], refresh:readonly RefreshState[], options:{now?:Date;automaticEnabled?:boolean}={}):OperationalCoverage[] {
 const now=options.now??new Date();
 return competitions.map(competition=>{
  const rows=records.filter(r=>r.draft.competitionId===competition.id);
  const published=orderSportsSnapshots(rows.filter(r=>!r.archived&&r.published&&validateSnapshot(r.published,now).length===0).map(r=>r.published!))[0];
  const candidate=rows.find(r=>!r.archived&&r.reviewedRevision===r.revision&&r.reviewedAt&&Date.parse(r.reviewedAt)<=now.getTime()&&now.getTime()-Date.parse(r.reviewedAt)<=86400000&&validateSnapshot(r.draft,now).length===0&&JSON.stringify(r.draft)!==JSON.stringify(r.published));
  const permission=sourcePermission(competition);
  const state=published?publishedCoverage(published,now):candidate?'awaiting-publication':permission==='approved'?'unavailable-source':'rights-blocked';
  const eligible=competition.id==='bundesliga';
  const run=eligible?refresh.find(r=>r.sourceKey==='openligadb:bl1:2026'):undefined;
  const failure=!!run?.lastError;
  return {competitionId:competition.id,name:competition.officialName,sport:competition.sport,state,sourcePermission:permission,sourceId:published?.sourceId??null,
   season:published?.season??null,observedAt:published?.observedAt??null,observationBasis:published?.observationBasis??null,retrievedAt:published?.retrievedAt??null,
   ageHours:published?snapshotFreshness(published,now).ageHours:null,entities:published?.entities.length??0,tableRows:published?.tables.reduce((n,t)=>n+t.rows.length,0)??0,events:published?.events.length??0,
   candidateReviewed:!!candidate,candidateRevision:candidate?.revision??null,archivedRecords:rows.filter(r=>r.archived).length,
   refresh:{enabled:eligible&&options.automaticEnabled===true,eligible,lastAttemptAt:run?.lastAttemptAt??null,lastSuccessAt:run?.lastSuccessAt??null,lastFailureAt:null,lastError:run?.lastError??null,nextAllowedAt:run?.nextAllowedAt??null,failures:run?.failures??0,attention:failure||(eligible&&options.automaticEnabled===true&&(!run?.lastSuccessAt||now.getTime()-Date.parse(run.lastSuccessAt)>86400000))}};
 });
}
