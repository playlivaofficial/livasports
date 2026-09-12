import {authorizedScheduler} from '@/odds/scheduler-server';
import {affiliateDatabase} from '@/affiliate/runtime';
import {affiliateHealth} from '@/affiliate/operations';
import {commercialHeaders} from '@/affiliate/server';
export async function GET(request:Request){
  if(!authorizedScheduler(request))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:commercialHeaders});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers:commercialHeaders});
  try{return Response.json(await affiliateHealth(affiliateDatabase()),{headers:commercialHeaders});}
  catch{return Response.json({error:'COMMERCIAL_HEALTH_UNAVAILABLE'},{status:503,headers:commercialHeaders});}
}
