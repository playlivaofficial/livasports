import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import {CANONICAL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {defaultLanguage,languageCookie,languageTags,interfaceRoutes,pathLocale,type InterfaceLocale} from '@/localization/interface';
import {requestCountry,requestEffectiveGeo} from '@/odds/commercial-geo';

function competitionNotFound(locale:InterfaceLocale,head:boolean):Response {
  const text=locale==='en'?{title:'Competition not found',body:'This address does not match a covered competition.',back:'Back to football'}
    :locale==='br'?{title:'Competição não encontrada',body:'Este endereço não corresponde a uma competição coberta.',back:'Voltar ao futebol'}
    :{title:'Competición no encontrada',body:'Esta dirección no corresponde a una competición cubierta.',back:'Volver al fútbol'};
  const html=`<!doctype html><html lang="${languageTags[locale]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${text.title} | LivaSports</title><style>html{color-scheme:dark;background:#071019;font-family:Inter,system-ui,sans-serif}body{margin:0;color:#f4f7fa}.state{min-height:100svh;display:grid;place-content:center;padding:24px}.state h1{margin:0;font-size:clamp(1.6rem,5vw,2.4rem)}.state p{color:#a7b4c2;line-height:1.5}.state a{width:max-content;border-radius:6px;background:#24d39b;padding:12px 16px;color:#041816;font-weight:800;text-decoration:none}</style></head><body><main class="state"><h1>${text.title}</h1><p>${text.body}</p><a href="${interfaceRoutes[locale].football}">${text.back}</a></main></body></html>`;
  return new Response(head?null:html,{status:404,headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60'}});
}

export async function proxy(request:NextRequest):Promise<Response>{
  if(request.nextUrl.pathname==='/'){
    const geo=requestEffectiveGeo(request.headers);
    // BR is commercially ROW but retains an appropriate Portuguese default.
    const country=geo==='ROW'?requestCountry(request.headers):geo;
    const language=defaultLanguage(request.cookies.get(languageCookie)?.value,country);
    const response=NextResponse.redirect(new URL('/'+language,request.url),307);
    response.headers.set('cache-control','private, no-store');
    response.headers.set('vary','Cookie');return response;
  }
  const locale=pathLocale(request.nextUrl.pathname)??'en';
  const requested=request.nextUrl.searchParams.get('competition');
  // Preserve genuine 404s before the board's streaming boundary, with no DB work.
  if(request.nextUrl.pathname===interfaceRoutes[locale].football&&requested&&!CANONICAL_COMPETITION_TARGETS.some(target=>target.slug===requested))return competitionNotFound(locale,request.method==='HEAD');
  const forwarded=new Headers(request.headers);
  forwarded.set('x-livasports-interface-language',locale);
  // Entity identities are validated inside ISR. Never put per-request GEO/DB
  // validation in front of a public page cache hit.
  return NextResponse.next({request:{headers:forwarded}});
}

export const config = { matcher: ['/','/br/futebol','/mx/futbol','/co/futbol','/pe/futbol','/en/football'] };
