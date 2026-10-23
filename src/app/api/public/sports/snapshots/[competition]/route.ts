import {publishedSnapshot} from '@/multisport/server';
import {getSportsSource} from '@/multisport/sources';
import {competitionById} from '@/multisport/catalog';
export const revalidate=300;
export async function GET(request:Request,{params}:{params:Promise<{competition:string}>}){
 const {competition}=await params,url=new URL(request.url),season=url.searchParams.get('season');
 const headers={'X-Robots-Tag':'noindex, follow','Cache-Control':'no-store','X-LivaSports-Provider-Requests':'0'};
 if(!competitionById(competition)||[...url.searchParams.keys()].some(key=>key!=='season')||(season&&season.length>32))return Response.json({error:'NOT_FOUND'},{status:404,headers});
 try{const snapshot=await publishedSnapshot(competition,season??undefined);if(!snapshot)return Response.json({error:'NOT_FOUND'},{status:404,headers});const source=getSportsSource(snapshot.sourceId);return Response.json({attribution:source?.attribution,license:source?.licenseId,licenseUrl:source?.licenseUrl,snapshot},{headers:{...headers,'Content-Disposition':`attachment; filename="${competition}-snapshot.json"`}});}catch{return Response.json({error:'UNAVAILABLE'},{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
}
