import {fetchOpenLigaJson,normalizeOpenLigaSnapshot,openLigaSeasonActive,openLigaVersion,OPENLIGA_CONFIG,OPENLIGA_URLS,OpenLigaHttpError} from './openligadb';
import {snapshotHash,type SportsRepository} from './repository';

export type OpenLigaRefreshResult={status:'not-due'|'busy'|'season-expired'|'unchanged'|'staged'|'published'|'failed';requests:number;key?:string;error?:string;nextAllowedAt?:string};
type RefreshRepository=Pick<SportsRepository,'claimRefresh'|'finishRefresh'|'failRefresh'>;
/** Call only from an authorized Owner action/scheduler, never from public page rendering. */
export async function runOpenLigaDbRefresh(repo:RefreshRepository,options:{now?:Date;fetcher?:typeof fetch;jitterMs?:number;publishAutomatically?:boolean}={}):Promise<OpenLigaRefreshResult>{
  const now=options.now??new Date();
  if(!openLigaSeasonActive(now))return {status:'season-expired',requests:0};
  const claim=await repo.claimRefresh(OPENLIGA_CONFIG.sourceKey,now,options.jitterMs??Math.floor(Math.random()*300000));
  if(!claim.claimed)return {status:claim.reason,requests:0,...(claim.nextAllowedAt?{nextAllowedAt:claim.nextAllowedAt}:{})};
  let requests=0;
  const get=async(url:string)=>{requests++;return fetchOpenLigaJson(url,options.fetcher);};
  try{
    const version=openLigaVersion(await get(OPENLIGA_URLS.changed));
    const publishAutomatically=options.publishAutomatically??process.env.V3_OPENLIGA_AUTOMATION_ENABLED==='true';
    if(version===claim.previousVersion){const row=await repo.finishRefresh({sourceKey:OPENLIGA_CONFIG.sourceKey,token:claim.token,upstreamVersion:version,publishAutomatically},now);return {status:row?'published':'unchanged',requests,...(row?{key:row.key}:{})};}
    const table=await get(OPENLIGA_URLS.table),matches=await get(OPENLIGA_URLS.matches);
    const snapshot=normalizeOpenLigaSnapshot(table,matches,now);
    const row=await repo.finishRefresh({sourceKey:OPENLIGA_CONFIG.sourceKey,token:claim.token,upstreamVersion:version,snapshot,publishAutomatically},now);
    const published=publishAutomatically&&row&&!row.archived&&row.published&&snapshotHash(row.published)===snapshotHash(row.draft);
    return {status:published?'published':'staged',requests,key:row?.key};
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const code=error instanceof OpenLigaHttpError?error.code:/^(?:UPSTREAM_[A-Z_]+|INVALID_SNAPSHOT|SOURCE_NOT_APPROVED|UNVERIFIED_POINTS_ADJUSTMENT)$/.test(message)?message:'REFRESH_FAILED';
    await repo.failRefresh(OPENLIGA_CONFIG.sourceKey,claim.token,code,now);
    return {status:'failed',requests,error:code};
  }
}
