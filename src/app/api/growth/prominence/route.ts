import {isInterfaceLocale} from '@/localization/interface';
import {requestEffectiveGeo} from '@/odds/commercial-geo';
import {isCoreGeo} from '@/config/geo';
import {targetBySlug} from '@/config/footballCompetitions';
import {readPriorityLinks} from '@/growth/prominence-read';
import type {GrowthSurface} from '@/growth/prominence-types';
import {requestLimit} from '@/security/request-limit';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:Request){
  const params=new URL(request.url).searchParams,locale=params.get('locale'),kind=params.get('kind');
  if(!isInterfaceLocale(locale)||[...params.keys()].some(k=>!['locale','kind','slug','teamId','fixtureId'].includes(k)||params.getAll(k).length!==1))return Response.json({error:'INVALID_CONTEXT'},{status:400,headers});
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  let surface:GrowthSurface;
  if(kind==='HOME'||kind==='DAILY')surface={kind};
  else if(kind==='COMPETITION'&&targetBySlug(params.get('slug')??''))surface={kind,slug:params.get('slug')!};
  else if(kind==='TEAM'&&uuid.test(params.get('teamId')??''))surface={kind,teamId:params.get('teamId')!};
  else if(kind==='MATCH'&&uuid.test(params.get('fixtureId')??''))surface={kind,fixtureId:params.get('fixtureId')!};
  else return Response.json({error:'INVALID_CONTEXT'},{status:400,headers});
  const geo=requestEffectiveGeo(request.headers);
  if(!isCoreGeo(geo))return Response.json({geo,rows:[],providerRequests:0},{headers});
  const limited=await requestLimit(request,'search');if(limited)return limited;
  const rows=await readPriorityLinks(surface,geo).catch(()=>[]);
  return Response.json({geo,rows,providerRequests:0},{headers});
}
