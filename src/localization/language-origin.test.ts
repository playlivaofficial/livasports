import {afterEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {languagePostOrigin} from './language-origin';
import {POST} from '@/app/language/route';

const request=(url:string,origin:string,host?:string,extra:Record<string,string>={})=>new NextRequest(url+'/language',{method:'POST',headers:{origin,...(host?{host}:{}),...extra},body:new URLSearchParams({locale:'pt',returnTo:'/en/news?newsSport=tennis#news-feed-heading'})});
afterEach(()=>vi.unstubAllEnvs());
describe('language POST origin validation under Next loopback normalization',()=>{
  it.each(['127.0.0.1','localhost','[::1]'])('preserves a genuine local %s browser origin, port and filtered destination',async host=>{
    vi.stubEnv('NODE_ENV','development');vi.stubEnv('VERCEL','');
    const origin=`http://${host}:3350`,req=request(origin,origin,`${host}:3350`,{'sec-fetch-site':'same-origin'});
    expect(req.nextUrl.origin).toBe('http://localhost:3350');expect(languagePostOrigin(req)).toBe(origin);
    const response=await POST(req);expect(response.status).toBe(303);expect(response.headers.get('location')).toBe(origin+'/br/noticias?newsSport=tennis#news-feed-heading');
    expect(response.headers.getSetCookie()).toHaveLength(1);expect(response.headers.get('set-cookie')).toContain('livasports_language=pt');expect(response.headers.get('set-cookie')).not.toMatch(/authjs|commercial|owner/);
  });
  it.each([
    ['http://evil.example:3350','127.0.0.1:3350',{}],
    ['http://localhost:3350','127.0.0.1:3350',{}],
    ['http://127.0.0.1:3350','localhost:3350',{}],
    ['http://127.0.0.1:3351','127.0.0.1:3351',{}],
    ['https://127.0.0.1:3350','127.0.0.1:3350',{}],
    ['http://127.0.0.1:3350','evil.example:3350',{'x-forwarded-host':'127.0.0.1:3350'}],
    ['http://127.0.0.1:3350','127.0.0.1:3350',{'sec-fetch-site':'cross-site'}],
    ['http://127.0.0.1:3350','127.0.0.1:3350',{'sec-fetch-site':'same-site'}],
    ['http://127.0.0.1:3350/path','127.0.0.1:3350',{}],
    ['null','127.0.0.1:3350',{}],
  ] as const)('rejects cross-origin and forged local requests %#',async(origin,host,extra)=>{
    vi.stubEnv('NODE_ENV','development');const response=await POST(request('http://127.0.0.1:3350',origin,host,extra));expect(response.status).toBe(403);expect(response.headers.has('set-cookie')).toBe(false);
  });
  it('does not enable the loopback exception for production, hosting or a missing Host',()=>{
    const req=request('http://127.0.0.1:3350','http://127.0.0.1:3350','127.0.0.1:3350');
    expect(languagePostOrigin(req,{NODE_ENV:'production'})).toBeNull();expect(languagePostOrigin(req,{NODE_ENV:'development',VERCEL:'1'})).toBeNull();
    expect(languagePostOrigin(request('http://127.0.0.1:3350','http://127.0.0.1:3350'),{NODE_ENV:'development'})).toBeNull();
  });
  it('retains strict production origin checking and never trusts a forwarded host override',()=>{
    const env={NODE_ENV:'production',VERCEL:'1'};
    expect(languagePostOrigin(request('https://livasports.com','https://livasports.com','livasports.com'),env)).toBe('https://livasports.com');
    expect(languagePostOrigin(request('https://livasports.com','https://evil.example','livasports.com',{'x-forwarded-host':'evil.example'}),env)).toBeNull();
    expect(languagePostOrigin(request('https://livasports.com','http://livasports.com','livasports.com'),env)).toBeNull();
  });
});
