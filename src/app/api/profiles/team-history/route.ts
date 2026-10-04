import {NextRequest,NextResponse} from 'next/server';
import {loadTeamProfile} from '@/profiles/runtime';
import {teamHistorySelection} from '@/profiles/history-policy';
import {loadTeamHistory} from '@/sports/runtime';
import {requestLimit} from '@/security/request-limit';

export const dynamic='force-dynamic';

/** Public, read-only sports facts. No cookies, odds, campaigns, or account state. */
export async function GET(request:NextRequest){
  const query=request.nextUrl.searchParams,id=query.get('id')??'',locale=query.get('locale');
  const keys=new Set(['id','locale','matches','p','season']);
  if(!/^[a-f0-9]{16}$/.test(id)||!(['br','mx','en'] as const).includes(locale as 'br'|'mx'|'en')||request.nextUrl.search.length>400||[...query.keys()].some(key=>!keys.has(key)||query.getAll(key).length!==1)){
    return NextResponse.json({error:'INVALID_HISTORY_QUERY'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
  const limited=await requestLimit(request,'read');if(limited)return limited;
  const language=locale as 'br'|'mx'|'en';
  try{
    const result=await loadTeamProfile(id,language==='en'?'br':language);
    if(result.kind==='not-found')return NextResponse.json({error:'PROFILE_NOT_FOUND'},{status:404,headers:{'Cache-Control':'public, max-age=0, s-maxage=300'}});
    const {view,page,season}=teamHistorySelection(result.profile,query);
    const history=await loadTeamHistory(id,language,view,page,season);
    return NextResponse.json(history,{headers:{'Cache-Control':'public, max-age=60, s-maxage=300, stale-while-revalidate=300'}});
  }catch{return NextResponse.json({error:'HISTORY_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
