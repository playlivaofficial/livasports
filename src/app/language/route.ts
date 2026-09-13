import {NextResponse,type NextRequest} from 'next/server';
import {isInterfaceLocale,languageCookie,translatedPath} from '@/localization/interface';

export async function POST(request:NextRequest){
  if(request.headers.get('origin')!==request.nextUrl.origin)return new Response(null,{status:403});
  let data:FormData;try{data=await request.formData();}catch{return new Response(null,{status:400});}
  const locale=data.get('locale'),returnTo=data.get('returnTo');
  if(!isInterfaceLocale(locale)||typeof returnTo!=='string'||returnTo.length>2048||data.getAll('locale').length!==1)return new Response(null,{status:400});
  const response=NextResponse.redirect(new URL(translatedPath(returnTo,locale),request.url),303);
  response.cookies.set(languageCookie,locale,{path:'/',maxAge:365*24*60*60,httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:'});
  response.headers.set('cache-control','private, no-store');
  return response;
}
