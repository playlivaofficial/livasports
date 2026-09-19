import {describe,expect,it,vi,afterEach} from 'vitest';
import config from '../../next.config';

describe('launch response security policy',()=>{
  afterEach(()=>vi.unstubAllEnvs());
  it('protects pages without overriding the publisher sandbox policy',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const rules=await config.headers!();
    const all=rules.find(r=>r.source==='/(.*)')!;
    expect(all.headers).toEqual(expect.arrayContaining([{key:'X-Content-Type-Options',value:'nosniff'},{key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains'}]));
    expect(all.headers.some(h=>['X-Frame-Options','Content-Security-Policy'].includes(h.key))).toBe(false);
    const pages=rules.find(r=>r.source.includes('(?!api/commercial/creative)'))!;
    const csp=pages.headers.find(h=>h.key==='Content-Security-Policy')!.value;
    expect(csp).toContain("frame-ancestors 'none'");expect(csp).toContain("object-src 'none'");expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toContain('unsafe-eval');expect(csp).not.toContain('sportmonks');expect(csp).not.toContain('oddspapi');
    expect(rules.find(r=>r.source==='/api/auth/:path*')?.headers).toContainEqual({key:'Referrer-Policy',value:'no-referrer'});
  });
});
