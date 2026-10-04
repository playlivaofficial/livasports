import {describe,expect,it} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {NextRequest} from 'next/server';
// This installed Next build still exports the pre-rename testing helper, despite
// its bundled Proxy documentation naming it unstable_doesProxyMatch.
import {unstable_doesMiddlewareMatch as unstable_doesProxyMatch} from 'next/experimental/testing/server';
import {config,proxy} from './proxy';

describe('narrow, database-free routing proxy',()=>{
  it.each(['/','/br/futebol','/mx/futbol','/en/football','/mx/futbol?competition=liga-mx&tab=results'])(
    'handles only root and board query routes: %s',url=>{
      expect(unstable_doesProxyMatch({config,nextConfig:{},url})).toBe(true);
    });
  it.each([
    '/br','/mx','/en','/br/jogo/home-x-away-0123456789abcdef','/mx/partido/home-x-away-0123456789abcdef',
    '/en/match/home-x-away-0123456789abcdef','/br/time/team-0123456789abcdef','/mx/equipo/team-0123456789abcdef',
    '/en/team/team-0123456789abcdef','/br/jogador/name-0123456789abcdef','/mx/jugador/name-0123456789abcdef',
    '/en/player/name-0123456789abcdef','/mx/partido/not-valid','/br/futebol/unknown',
    '/api/odds/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','/api/auth/session','/api/commercial/offers','/api/owner/preview',
    '/owner','/owner/growth','/mx/cuenta','/en/sign-in','/_next/static/chunk.js','/_next/image?url=image.png',
    '/favicon.ico','/robots.txt','/sitemap.xml','/sports-sitemaps.xml','/br/asset.png','/assets/logo.svg',
  ])('does not invoke a function before cache/auth/assets: %s',url=>{
    expect(unstable_doesProxyMatch({config,nextConfig:{},url})).toBe(false);
  });
  it('has no DB/provider imports or entity queries',()=>{
    const source=readFileSync(new URL('./proxy.ts',import.meta.url),'utf8');
    expect(source).not.toMatch(/database\/client|PostgresDatabaseClient|\.query\(|@\/providers|parseMatchParam|parseProfileParam/);
  });
  it('does not put canonical entity validation behind a locale-wide streaming boundary',()=>{
    for(const locale of ['br','mx','en'])expect(existsSync(`src/app/${locale}/loading.tsx`)).toBe(false);
    for(const path of ['br/futebol','mx/futbol','en/football','br/ao-vivo','mx/en-vivo','en/live',
      'br/jogos/hoje','mx/partidos/hoy','en/matches/today']){
      expect(existsSync(`src/app/${path}/loading.tsx`)).toBe(true);
    }
  });
  it.each(['/br/futebol','/mx/futbol','/en/football'])('rejects an unknown competition before streaming: %s',async path=>{
    const response=await proxy(new NextRequest(`https://livasports.com${path}?competition=not-a-covered-competition`));
    expect(response.status).toBe(404);expect(await response.text()).toContain('noindex');
    expect(response.headers.has('set-cookie')).toBe(false);
    const head=await proxy(new NextRequest(`https://livasports.com${path}?competition=not-a-covered-competition`,{method:'HEAD'}));
    expect(head.status).toBe(404);expect(await head.text()).toBe('');
  });
  it('passes a known competition to the page without private cookies or GEO mutation',async()=>{
    const response=await proxy(new NextRequest('https://livasports.com/mx/futbol?competition=liga-mx',{
      headers:{'x-vercel-ip-country':'PE','x-livasports-interface-language':'br'},
    }));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-request-x-livasports-interface-language')).toBe('mx');
    expect(response.headers.get('x-middleware-request-x-vercel-ip-country')).toBe('PE');
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});
