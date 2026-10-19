import 'server-only';
import {unstable_cache} from 'next/cache';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {SportsRepository} from './repository';
import {localPreviewSnapshots} from './local-preview';

export const sportsCacheTag='v3-sports-snapshots';
export async function withSportsRepository<T>(work:(repo:SportsRepository)=>Promise<T>):Promise<T>{
  const url=databaseUrl();if(!url)throw new Error('SPORTS_STORAGE_UNAVAILABLE');
  const db=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:5000});
  try{return await work(new SportsRepository(db));}finally{await db.close();}
}
// Local QA may show only retained, validated audit artifacts behind a strict development-only gate.
// Missing production storage means honest empty coverage, never a synthetic or seed table.
// Configured-database errors propagate so callers can show a distinct unavailable state.
export async function publishedSnapshots(){
  if(!databaseUrl())return localPreviewSnapshots();
  return cachedSnapshots();
}
export async function publishedSnapshot(competitionId:string,season?:string){
  // Public downloads use this DB-only path. Local preview artifacts must never be exported here.
  if(!databaseUrl())return null;
  return cachedSnapshot(competitionId,season);
}
// Match the existing editorial cache pattern; no extra process cache can outlive an archive invalidation.
const cachedSnapshots=unstable_cache(()=>withSportsRepository(repo=>repo.listPublished()),['v3-sports-published'],{tags:[sportsCacheTag],revalidate:300});
const cachedSnapshot=unstable_cache((competitionId:string,season?:string)=>withSportsRepository(repo=>repo.findPublished(competitionId,season)),['v3-sports-publication'],{tags:[sportsCacheTag],revalidate:300});
