import {NextResponse,type NextRequest} from 'next/server';
import {defaultLanguage,languagePreference,languageCookie,translatedPath} from '@/localization/interface';
import {requestEffectiveGeo} from '@/odds/commercial-geo';

export async function POST(request:NextRequest){
  if(request.headers.get('origin')!==request.nextUrl.origin)return new Response(null,{status:403});
  let data:FormData;try{data=await request.formData();}catch{return new Response(null,{status:400});}
  const locale=data.get('locale'),returnTo=data.get('returnTo');
  const preference=languagePreference(locale);
  if(!preference||typeof returnTo!=='string'||returnTo.length>2048||data.getAll('locale').length!==1)return new Response(null,{status:400});
  const target=defaultLanguage(preference,requestEffectiveGeo(request.headers));
  const response=NextResponse.redirect(new URL(translatedPath(returnTo,target),request.url),303);
  response.cookies.set(languageCookie,preference,{path:'/',maxAge:365*24*60*60,httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:'});
  response.headers.set('cache-control','private, no-store');
  return response;
}
