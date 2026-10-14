import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {revalidatePath} from 'next/cache';

/** The ranking and pending paths commit together. A failed refresh remains retryable next hour. */
export async function refreshGrowthDiscovery(db:QueryExecutor,invalidate:(path:string)=>void=revalidatePath){
 const pending=(await db.query(`SELECT id,geo,discovery_paths FROM growth_geo_runs
  WHERE state='SUCCEEDED' AND discovery_revalidated_at IS NULL AND discovery_paths<>'[]'::jsonb
  ORDER BY id LIMIT 100`)).rows;
 const paths=new Set<string>();
 for(const row of pending){
  const values=typeof row.discovery_paths==='string'?JSON.parse(row.discovery_paths):row.discovery_paths;
  if(!Array.isArray(values))throw Error('INVALID_DISCOVERY_PATHS');
  for(const path of values){
   // Only public GEO discovery pages; never invalidate the whole app or a foreign URL.
   if(typeof path!=='string'||path.length>1024||!new RegExp(`^/${String(row.geo).toLowerCase()}(?:$|/(?:partidos/hoy|futbol\\?competition=[a-z0-9-]+|equipo/[a-z0-9-]+)$)`).test(path))throw Error('INVALID_DISCOVERY_PATH');
   // Competition hubs are query variants of the existing /futbol page, not separate route files.
   paths.add(path.split('?')[0]);
  }
 }
 for(const path of paths)invalidate(path);
 if(pending.length)await db.query(`UPDATE growth_geo_runs SET discovery_revalidated_at=now()
  WHERE id=ANY($1::bigint[]) AND discovery_revalidated_at IS NULL`,[pending.map(row=>row.id)]);
 return {runs:pending.length,paths:paths.size};
}
