import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import { matchPath, parseMatchParam } from '@/match-center/routes';

let database: PostgresDatabaseClient | null = null;
function matchDatabase(): PostgresDatabaseClient {
  if (database) return database;
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error('Match route database is not configured');
  database = new PostgresDatabaseClient(connectionString);
  return database;
}

function notFoundResponse(locale: 'br'|'mx', head: boolean): Response {
  const text = locale === 'br'
    ? { lang:'pt-BR',title:'Partida não encontrada',body:'Este endereço não corresponde a uma partida cadastrada.',back:'Voltar aos jogos',href:'/br/futebol' }
    : { lang:'es-MX',title:'Partido no encontrado',body:'Esta dirección no corresponde a un partido registrado.',back:'Volver a los partidos',href:'/mx/futbol' };
  const html = `<!doctype html><html lang="${text.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${text.title} | LivaSports</title><style>html{color-scheme:dark;background:#071019;font-family:Inter,system-ui,sans-serif}body{margin:0;color:#f4f7fa}.state{min-height:100svh;display:grid;place-content:center;padding:24px}.state h1{margin:0;font-size:clamp(1.6rem,5vw,2.4rem)}.state p{color:#a7b4c2;line-height:1.5}.state a{width:max-content;border-radius:6px;background:#24d39b;padding:12px 16px;color:#041816;font-weight:800;text-decoration:none}</style></head><body><main class="state"><h1>${text.title}</h1><p>${text.body}</p><a href="${text.href}">${text.back}</a></main></body></html>`;
  return new Response(head ? null : html, { status:404,headers:{ 'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60' } });
}

export async function proxy(request: NextRequest): Promise<Response> {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const locale = segments[0] === 'mx' ? 'mx' : 'br';
  const parsed = parseMatchParam(segments[2] ?? '');
  if (!parsed) return notFoundResponse(locale,request.method === 'HEAD');
  try {
    const result = await matchDatabase().query<{ public_id:string; home:string; away:string }>(`SELECT f.public_id,ht.name AS home,at.name AS away
      FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE f.public_id=$1`,[parsed.publicId]);
    const fixture = result.rows[0];
    if (!fixture) return notFoundResponse(locale,request.method === 'HEAD');
    const canonical = matchPath(locale,fixture.public_id,fixture.home,fixture.away);
    if (request.nextUrl.pathname !== canonical) return NextResponse.redirect(new URL(canonical,request.url),308);
    return NextResponse.next();
  } catch {
    // A database outage must reach the route error boundary, never masquerade as a missing match.
    return NextResponse.next();
  }
}

export const config = { matcher: ['/br/jogo/:match','/mx/partido/:match'] };
