import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {ownerCookie,requestOwnerSession,signOwnerSession,newOwnerSession,accessKeyHash} from '@/owner/session';
import {authCallbackUrl,safeAuthPath} from './redirect';
import {USER_SESSION_COOKIE,USER_SESSION_COOKIE_SECURE,canonicalAuthUrl,userSessionCookieName,userSessionCookieOptions} from './identity';

const config=readFileSync('src/auth/config.ts','utf8');
const pages=readFileSync('src/auth/pages.tsx','utf8');
const header=readFileSync('src/components/sports/SiteHeader.tsx','utf8');
const proxy=readFileSync('src/proxy.ts','utf8');
const layout=readFileSync('src/app/layout.tsx','utf8');
const css=readFileSync('src/app/auth.css','utf8');
const env=readFileSync('.env.example','utf8');

describe('callback, cookie and owner isolation',()=>{
  it('rejects open redirects and only allows local auth/sports destinations',()=>{
    expect(safeAuthPath('https://evil.test','en')).toBe('/en');
    expect(safeAuthPath('//evil.test','br')).toBe('/br');
    expect(safeAuthPath('/\\evil.test','mx')).toBe('/mx');
    expect(safeAuthPath('/en/sign-in','en','home')).toBe('/en/sign-in');
    expect(authCallbackUrl('br','https://evil.test/callback')).toBe('/br/conta');
    expect(authCallbackUrl('en','/en/account')).toBe('/en/account');
    expect(safeAuthPath('/api/auth/callback/google','en')).toBe('/en');
    expect(config).toContain('safeAuthPath');
  });

  it('rejects a non-URL AUTH_URL and uses the public production origin on Vercel',()=>{
    expect(canonicalAuthUrl('https://livasports.com','1')).toBe('https://livasports.com');
    expect(canonicalAuthUrl('not-a-url','1')).toBe('https://livasports.com');
    expect(canonicalAuthUrl('not-a-url')).toBe('');
  });

  it('uses a distinct HttpOnly Lax user cookie and never reuses owner secrets or cookies',()=>{
    expect(USER_SESSION_COOKIE).toBe('livasports-user');
    expect(USER_SESSION_COOKIE_SECURE).toBe('__Secure-livasports-user');
    expect(USER_SESSION_COOKIE).not.toBe(ownerCookie);
    expect(USER_SESSION_COOKIE_SECURE).not.toBe(ownerCookie);
    expect(userSessionCookieName(true)).toBe(USER_SESSION_COOKIE_SECURE);
    expect(userSessionCookieOptions(true)).toEqual({httpOnly:true,sameSite:'lax',path:'/',secure:true});
    expect(userSessionCookieOptions(false)).toEqual({httpOnly:true,sameSite:'lax',path:'/',secure:false});
    expect(config).not.toContain('OWNER_QA');
    expect(config).toContain("strategy:'database'");
    expect(config).toContain('allowDangerousEmailAccountLinking:false');
    expect(config).toContain("scope:'openid email profile'");
    expect(config).not.toContain('console.log');
  });

  it('keeps owner preview authentication independent of the user session cookie',()=>{
    const env={OWNER_QA_SESSION_SECRET:'s'.repeat(43),OWNER_QA_ACCESS_HASH:accessKeyHash('k'.repeat(43)),VERCEL:'1'};
    const owner=signOwnerSession(newOwnerSession(),env);
    const both=new Headers({cookie:`${USER_SESSION_COOKIE}=forged-user; ${ownerCookie}=${owner}`});
    const userOnly=new Headers({cookie:`${USER_SESSION_COOKIE}=forged-user`});
    expect(requestOwnerSession(both,env)?.preview).toBe(false);
    expect(requestOwnerSession(userOnly,env)).toBeNull();
    expect(requestOwnerSession(new Headers({cookie:`${ownerCookie}=${owner}`}),{...env,OWNER_QA_SESSION_SECRET:'u'.repeat(43)})).toBeNull();
  });
});

describe('auth surfaces stay public-sports safe',()=>{
  it('does not replace proxy.ts or globally gate sports pages',()=>{
    expect(proxy).toContain("matcher: ['/','/br/:path*','/mx/:path*','/en/:path*']");
    expect(proxy).not.toContain('next-auth');
    expect(layout).not.toContain('SessionProvider');
    expect(layout).not.toContain('@/auth/');
    expect(pages).not.toMatch(/@\/providers|Sportmonks|OddsPapi|odds_current/);
    expect(header).toContain('AuthHeaderLink');
    expect(pages).toContain("if(!session?.user?.id)redirect(authPath(locale,'signin'))");
    expect(readFileSync('src/auth/actions.ts','utf8')).toContain("signOut({redirectTo:authPath(locale,'signin')})");
  });

  it('localizes sign-in and account routes without exposing secrets in client auth UI',()=>{
    const client=readFileSync('src/auth/SignInForm.tsx','utf8')+readFileSync('src/auth/AuthHeaderLink.tsx','utf8');
    expect(client).not.toMatch(/AUTH_SECRET|AUTH_GOOGLE_SECRET|AUTH_SMTP_PASSWORD|OWNER_QA/);
    expect(readFileSync('src/app/br/entrar/page.tsx','utf8')).toContain("locale=\"br\"");
    expect(readFileSync('src/app/en/sign-in/page.tsx','utf8')).toContain("locale=\"en\"");
    expect(readFileSync('src/app/mx/iniciar-sesion/page.tsx','utf8')).toContain("locale=\"mx\"");
    expect(readFileSync('src/app/br/conta/page.tsx','utf8')).toContain("locale=\"br\"");
    expect(readFileSync('src/app/en/account/page.tsx','utf8')).toContain("locale=\"en\"");
    expect(readFileSync('src/app/mx/cuenta/page.tsx','utf8')).toContain("locale=\"mx\"");
    expect(css).toContain('width:min(100%,32rem)');
    expect(css).toContain('html[data-theme=dark]');
    expect(css).toContain('var(--color-surface)');
    expect(env).toMatch(/^AUTH_SECRET=$/m);
    expect(env).toContain('AUTH_GOOGLE_ID=');
    expect(env).toContain('AUTH_SMTP_PASSWORD=');
    expect(env).not.toMatch(/AUTH_SECRET=.{8,}/);
    expect(readFileSync('src/localization/legal-content.ts','utf8')).toMatch(/identificadores de sessão|identificadores de sesión|session identifiers/);
  });
});
