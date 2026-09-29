import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({query:vi.fn(),session:vi.fn(),authorized:vi.fn(),run:vi.fn()}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('@/owner/session',()=>({ownerConfigured:()=>true,requestOwnerSession:m.session}));
vi.mock('@/owner/HealthDashboard',()=>({OwnerHealthLogin:()=> <p>Owner login required</p>}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class {query=m.query;close=async()=>undefined;}}));
vi.mock('@/odds/scheduler-server',()=>({authorizedScheduler:m.authorized}));
vi.mock('./service',()=>({runSeoAutopilot:m.run}));
vi.mock('@/sports/SportsLink',()=>({default:({children,...props}:React.ComponentProps<'a'>)=><a {...props}>{children}</a>}));
import Page from '@/app/owner/growth/autopilot/page';
import {GET} from '@/app/api/internal/seo-autopilot/route';
import {SeoPriorityLinks} from './public';
describe('owner and scheduler boundaries',()=>{
  it('blocks anonymous owner reads before any database query',async()=>{m.session.mockReturnValue(false);m.query.mockClear();const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));expect(html).toContain('Owner login required');expect(m.query).not.toHaveBeenCalled();});
  it('blocks unauthenticated scheduling before any work',async()=>{m.authorized.mockReturnValue(false);expect((await GET(new Request('https://livasports.com/api/internal/seo-autopilot'))).status).toBe(401);expect(m.run).not.toHaveBeenCalled();});
  it('previews never run the production worker',async()=>{vi.stubEnv('VERCEL_ENV','preview');m.authorized.mockReturnValue(true);expect((await GET(new Request('https://livasports.com/api/internal/seo-autopilot'))).status).toBe(403);vi.unstubAllEnvs();});
  it('renders real crawlable links and no Brazil copy in other locales',async()=>{
    m.query.mockResolvedValue({rows:[{url:'https://livasports.com/br/jogo/a-b-1111111111111111',home:'A',away:'B',competition:'Liga'}]});
    const html=renderToStaticMarkup(await SeoPriorityLinks({locale:'br',surface:{kind:'HOME'}}));expect(html).toContain('href="/br/jogo/a-b-1111111111111111"');
    expect(await SeoPriorityLinks({locale:'en',surface:{kind:'HOME'}})).toBeNull();expect(await SeoPriorityLinks({locale:'mx',surface:{kind:'HOME'}})).toBeNull();
  });
  it('has no provider fetching or social rendering entry point',()=>{for(const file of ['service.ts','repository.ts','public.tsx']){
    const text=readFileSync(new URL(file,import.meta.url),'utf8');expect(text).not.toMatch(/SportmonksAdapter|OddsPapiAdapter|runGrowthGeneration|renderCanonicalPackage/);}
  });
  it('migration is additive, idempotent and isolated to SEO state',()=>{const sql=readFileSync(new URL('../../db/migrations/051_seo_autopilot.sql',import.meta.url),'utf8');
    expect(sql).not.toMatch(/DROP\s|TRUNCATE\s|DELETE FROM|ALTER TABLE (fixtures|users|odds)/i);expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(6);});
  it('keeps repaired links while a qualified page waits for its publication budget',()=>{
    const text=readFileSync(new URL('public.tsx',import.meta.url),'utf8');expect(text).toContain('DAILY_PUBLICATION_CAP');expect(text).toContain('INSUFFICIENT_INBOUND_LINKS');
  });
  it('period links use a complete route with native navigation and touch-sized controls',()=>{
    const text=readFileSync(new URL('Dashboard.tsx',import.meta.url),'utf8');expect(text).toContain('href={`/owner/growth/autopilot?days=${d}`}');expect(text).toContain('minHeight:44');expect(text).not.toContain('href={`?days=');
  });
  it('versions persisted sitemap entry/count caches for V2 eligibility and locale-specific lastmod',()=>{
    const text=readFileSync(new URL('../sports/sitemap-runtime.ts',import.meta.url),'utf8');
    expect(text).toContain("entityCacheVersion='sports:sitemap:v4'");
    expect(text).toContain('`${entityCacheVersion}:counts`');
    expect(text).toContain('`${entityCacheVersion}:${kind}:${page}`');
    expect(text).toContain('ttlSeconds:6*3600');
  });
});
