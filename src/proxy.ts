import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import {parseMatchParam} from '@/match-center/routes';
import {parseProfileParam} from '@/profiles/routes';
import {CANONICAL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {defaultLanguage,languageCookie,languageTags,interfaceRoutes,pathLocale,matchPath,playerPath,teamPath,type InterfaceLocale} from '@/localization/interface';

let database: PostgresDatabaseClient | null = null;
function matchDatabase(): PostgresDatabaseClient {
  if (database) return database;
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error('Match route database is not configured');
  database = new PostgresDatabaseClient(connectionString);
  return database;
}

function notFoundResponse(locale: InterfaceLocale, head: boolean, entity: 'match'|'team'|'player'|'competition'='match'): Response {
  const text = locale === 'en'?{lang:'en',title:entity==='team'?'Team not found':entity==='player'?'Player not found':entity==='competition'?'Competition not found':'Match not found',body:entity==='match'?'This address does not match a recorded match.':entity==='competition'?'This address does not match a covered competition.':'This address does not match a recorded profile.',back:'Back to football',href:'/en/football'}:locale === 'br'
    ? { lang:'pt-BR',title:entity==='team'?'Time não encontrado':entity==='player'?'Jogador não encontrado':entity==='competition'?'Competição não encontrada':'Partida não encontrada',
      body:entity==='match'?'Este endereço não corresponde a uma partida cadastrada.':entity==='competition'?'Este endereço não corresponde a uma competição coberta.':'Este endereço não corresponde a um perfil cadastrado.',
      back:'Voltar ao futebol',href:'/br/futebol' }
    : { lang:languageTags[locale],title:entity==='team'?'Equipo no encontrado':entity==='player'?'Jugador no encontrado':entity==='competition'?'Competición no encontrada':'Partido no encontrado',
      body:entity==='match'?'Esta dirección no corresponde a un partido registrado.':entity==='competition'?'Esta dirección no corresponde a una competición cubierta.':'Esta dirección no corresponde a un perfil registrado.',
      back:'Volver al fútbol',href:interfaceRoutes[locale].football };
  const html = `<!doctype html><html lang="${text.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${text.title} | LivaSports</title><style>html{color-scheme:dark;background:#071019;font-family:Inter,system-ui,sans-serif}body{margin:0;color:#f4f7fa}.state{min-height:100svh;display:grid;place-content:center;padding:24px}.state h1{margin:0;font-size:clamp(1.6rem,5vw,2.4rem)}.state p{color:#a7b4c2;line-height:1.5}.state a{width:max-content;border-radius:6px;background:#24d39b;padding:12px 16px;color:#041816;font-weight:800;text-decoration:none}</style></head><body><main class="state"><h1>${text.title}</h1><p>${text.body}</p><a href="${text.href}">${text.back}</a></main></body></html>`;
  return new Response(head ? null : html, { status:404,headers:{ 'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60' } });
}

export async function proxy(request: NextRequest): Promise<Response> {
  if(request.nextUrl.pathname==='/'){
    const country=process.env.VERCEL==='1'?request.headers.get('x-vercel-ip-country'):null;
    const language=defaultLanguage(request.cookies.get(languageCookie)?.value,country);
    const response=NextResponse.redirect(new URL('/'+language,request.url),307);
    response.headers.set('cache-control','private, no-store');
    response.headers.set('vary','Cookie');return response;
  }
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const locale=pathLocale(request.nextUrl.pathname)??'en';
  const forwarded=new Headers(request.headers);
  forwarded.set('x-livasports-interface-language',locale);
  const next=()=>NextResponse.next({request:{headers:forwarded}});
  const segment=segments[1];
  // P2: a ?competition slug outside the static registry is an unknown entity. Answer 404 here, before streaming
  // could turn the page's notFound() into a 200 response. Registry-known slugs continue to the page.
  if(segments.length===2&&['futebol','futbol','football'].includes(segment)){
    const requested=request.nextUrl.searchParams.get('competition');
    if(requested&&!CANONICAL_COMPETITION_TARGETS.some(target=>target.slug===requested))return notFoundResponse(locale,request.method==='HEAD','competition');
  }
  if(!['jogo','partido','match','time','equipo','team','jogador','jugador','player'].includes(segment))return next();
  const entity: 'match'|'team'|'player'=['time','equipo','team'].includes(segment)?'team':['jogador','jugador','player'].includes(segment)?'player':'match';
  if(segments.length!==3)return notFoundResponse(locale,request.method==='HEAD',entity);
  const parsed = entity==='match'?parseMatchParam(segments[2] ?? ''):parseProfileParam(segments[2] ?? '');
  if (!parsed) return notFoundResponse(locale,request.method === 'HEAD',entity);
  try {
    const result = entity==='match'
      ? await matchDatabase().query<{ public_id:string; home:string; away:string }>(`SELECT p.public_id,'fixture'::text AS home,'pending'::text AS away
        FROM sports_pending_fixtures p JOIN competitions c ON c.id=p.competition_id WHERE p.public_id=$1 AND c.enabled
        UNION ALL SELECT f.public_id,ht.name AS home,at.name AS away
        FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE f.public_id=$1
          AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id) LIMIT 1`,[parsed.publicId])
      : entity==='team'
        ? await matchDatabase().query<{ public_id:string; name:string }>('SELECT public_id,name FROM teams WHERE public_id=$1',[parsed.publicId])
        : await matchDatabase().query<{ public_id:string; name:string }>('SELECT public_id,display_name AS name FROM players WHERE public_id=$1',[parsed.publicId]);
    const row = result.rows[0];
    if (!row) return notFoundResponse(locale,request.method === 'HEAD',entity);
    const canonical = entity==='match' ? matchPath(locale,row.public_id,(row as {home:string}).home,(row as {away:string}).away)
      : entity==='team' ? teamPath(locale,row.public_id,(row as {name:string}).name) : playerPath(locale,row.public_id,(row as {name:string}).name);
    if (request.nextUrl.pathname !== canonical) return NextResponse.redirect(new URL(canonical,request.url),308);
    return next();
  } catch {
    // A database outage must reach the route error boundary, never masquerade as a missing match.
    return next();
  }
}

export const config = { matcher: ['/','/br/:path*','/mx/:path*','/co/:path*','/pe/:path*','/en/:path*'] };
