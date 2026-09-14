import {NextResponse,type NextRequest} from 'next/server';
import {deviceTimeZoneCookie,safeTimeZoneReturn,timeZoneCookie,validTimeZone} from '@/localization/time-zone';

export async function POST(request:NextRequest){
  if(request.headers.get('origin')!==request.nextUrl.origin)return new Response(null,{status:403});
  let data:FormData;try{data=await request.formData();}catch{return new Response(null,{status:400});}
  const mode=data.get('mode'),raw=data.get('timeZone'),zone=validTimeZone(raw);
  if(data.getAll('timeZone').length!==1||!['manual','device'].includes(String(mode))||(!zone&&!(mode==='manual'&&raw==='auto')))return new Response(null,{status:400});
  const automatic=mode==='device';
  const response=automatic?new NextResponse(null,{status:204}):NextResponse.redirect(new URL(safeTimeZoneReturn(data.get('returnTo')),request.url),303);
  // Device detection cannot replace an explicit preference. Commercial GEO is never written here.
  response.cookies.set(automatic?deviceTimeZoneCookie:timeZoneCookie,zone??'',{path:'/',maxAge:zone?(automatic?7:365)*86400:0,httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:'});
  response.headers.set('cache-control','private, no-store');return response;
}
