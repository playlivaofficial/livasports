import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import type {NextAuthConfig,Session} from 'next-auth';
import nodemailer from 'nodemailer';
import {pathLocale} from '@/localization/interface';
import {createAuthAdapter} from './adapter';
import {authConfigured,authDatabase,emailAuthConfigured,googleAuthConfigured} from './database';
import {googleSignInAllowed,MAGIC_LINK_TTL_SECONDS,SESSION_TTL_SECONDS,userSessionCookieName,userSessionCookieOptions} from './identity';
import {safeAuthPath} from './redirect';

// P1.1 does not auto-link Google to an existing magic-link user by email.
// allowDangerousEmailAccountLinking stays false. Authenticated linking is later work.
function buildAuthConfig():NextAuthConfig {
  const secret=process.env.AUTH_SECRET!.trim();
  const secure=process.env.VERCEL==='1'||process.env.NODE_ENV==='production';
  const providers:NextAuthConfig['providers']=[];
  if(googleAuthConfigured()){
    providers.push(Google({
      clientId:process.env.AUTH_GOOGLE_ID!,
      clientSecret:process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking:false,
      authorization:{params:{scope:'openid email profile'}},
    }));
  }
  if(emailAuthConfigured()){
    const server={host:process.env.AUTH_SMTP_HOST!,port:Number(process.env.AUTH_SMTP_PORT||'587'),auth:{user:process.env.AUTH_SMTP_USER!,pass:process.env.AUTH_SMTP_PASSWORD!}};
    providers.push(Nodemailer({
      id:'nodemailer',
      server,
      from:process.env.AUTH_EMAIL_FROM!,
      maxAge:MAGIC_LINK_TTL_SECONDS,
      sendVerificationRequest:async({identifier,url,provider})=>{
        const transport=nodemailer.createTransport(provider.server);
        await transport.sendMail({to:identifier,from:provider.from,subject:'LivaSports',text:`LivaSports\n${url}\n`});
      },
    }));
  }
  return {
    secret,trustHost:true,adapter:createAuthAdapter(authDatabase()),
    session:{strategy:'database',maxAge:SESSION_TTL_SECONDS,updateAge:24*60*60},
    cookies:{sessionToken:{name:userSessionCookieName(secure),options:userSessionCookieOptions(secure)}},
    pages:{signIn:'/en/sign-in',error:'/en/sign-in'},
    providers,
    callbacks:{
      async signIn({account,profile}){
        if(account?.provider==='google')return googleSignInAllowed(profile);
        return true;
      },
      async session({session,user}){
        session.user.id=user.id;
        return session;
      },
      async redirect({url,baseUrl}){
        const target=url.startsWith('/')?url:(()=>{try{const parsed=new URL(url);return parsed.origin===new URL(baseUrl).origin?parsed.pathname+parsed.search+parsed.hash: '/';}catch{return '/';}})();
        const locale=pathLocale(target)==='br'||pathLocale(target)==='mx'||pathLocale(target)==='en'?pathLocale(target)!:'en';
        return `${baseUrl}${safeAuthPath(target,locale,'home')}`;
      },
    },
  };
}

type AuthExports=ReturnType<typeof NextAuth>;
let cached:AuthExports|null=null;

function instance():AuthExports|null {
  if(!authConfigured())return null;
  cached??=NextAuth(buildAuthConfig);
  return cached;
}

export const handlers={
  GET:(request:Request)=>instance()?.handlers.GET(request as never)??Response.json({user:null}),
  POST:(request:Request)=>instance()?.handlers.POST(request as never)??new Response(null,{status:503}),
};

export async function auth():Promise<Session|null> {
  const current=instance();
  if(!current)return null;
  return (current.auth as ()=>Promise<Session|null>)();
}

export async function signIn(...args:Parameters<NonNullable<AuthExports['signIn']>>){
  const current=instance();
  if(!current)throw new Error('AUTH_NOT_CONFIGURED');
  return current.signIn(...args);
}

export async function signOut(...args:Parameters<NonNullable<AuthExports['signOut']>>){
  const current=instance();
  if(!current)return;
  return current.signOut(...args);
}

export {buildAuthConfig};
