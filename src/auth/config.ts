import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import type {NextAuthConfig,Session} from 'next-auth';
import nodemailer from 'nodemailer';
import {pathLocale,type InterfaceLocale} from '@/localization/interface';
import {createAuthAdapter} from './adapter';
import {authConfigured,authDatabase,emailAuthConfigured,googleAuthConfigured} from './database';
import {canonicalAuthUrl,googleSignInAllowed,normalizeEmail,MAGIC_LINK_TTL_SECONDS,SESSION_TTL_SECONDS,userSessionCookieName,userSessionCookieOptions} from './identity';
import {emailLoginAllowed} from './rate-limit';
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
    const server={host:process.env.AUTH_SMTP_HOST!,port:Number(process.env.AUTH_SMTP_PORT||'587'),auth:{user:process.env.AUTH_SMTP_USER!,pass:process.env.AUTH_SMTP_PASSWORD!},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000};
    providers.push(Nodemailer({
      id:'nodemailer',
      server,
      from:process.env.AUTH_EMAIL_FROM!,
      maxAge:MAGIC_LINK_TTL_SECONDS,
      normalizeIdentifier(value){const email=normalizeEmail(value);if(!email)throw new Error('INVALID_EMAIL');return email;},
      sendVerificationRequest:async({identifier,url,provider})=>{
        const transport=nodemailer.createTransport(provider.server);
        await transport.sendMail({to:identifier,from:provider.from,subject:'LivaSports',text:`LivaSports\n${url}\n`});
      },
    }));
  }
  return {
    secret,trustHost:true,adapter:createAuthAdapter(authDatabase()),
    // Auth.js errors can carry SMTP details or token-bearing URLs. Log only a bounded error type.
    logger:{error(error){console.error({event:'auth-error',code:('type' in error&&typeof error.type==='string'&&/^[A-Za-z]{1,50}$/.test(error.type))?error.type:'AuthError'});}},
    session:{strategy:'database',maxAge:SESSION_TTL_SECONDS,updateAge:24*60*60},
    cookies:{sessionToken:{name:userSessionCookieName(secure),options:userSessionCookieOptions(secure)}},
    pages:{signIn:'/en/sign-in',error:'/en/sign-in'},
    providers,
    events:{
      // P4: server-authoritative sign-in outcome. First-party analytics cookies ride on the auth callback request.
      async signIn({user,account}){
        try{
          const {headers}=await import('next/headers');const h=await headers();
          const {deferServerEvent}=await import('@/analytics/server');
          const ref=h.get('referer')??'';let locale:InterfaceLocale='en';try{locale=pathLocale(new URL(ref).pathname)??'en';}catch{/* default locale */}
          await deferServerEvent({name:'sign_in_completed',headers:h,locale,userId:user.id??null,canonicalPath:'/api/auth/callback',props:{method:account?.provider??'unknown'}});
        }catch{/* analytics never affects authentication */}
      },
    },
    callbacks:{
      async signIn({account,profile,email,user}){
        if(account?.provider==='google')return googleSignInAllowed(profile);
        if(account?.provider==='nodemailer'&&email?.verificationRequest){
          const normalized=normalizeEmail(user.email);if(!normalized)return false;
          const {headers}=await import('next/headers');
          const request=new Request('https://livasports.com/api/auth',{headers:await headers()});
          try{return (await emailLoginAllowed(request,normalized)).allowed;}catch{return false;}
        }
        return true;
      },
      async session({session,user}){
        session.user.id=user.id;
        return session;
      },
      async redirect({url,baseUrl}){
        const target=url.startsWith('/')?url:(()=>{try{const parsed=new URL(url);return parsed.origin===new URL(baseUrl).origin?parsed.pathname+parsed.search+parsed.hash: '/';}catch{return '/';}})();
        const locale=pathLocale(target)??'en';
        return `${baseUrl}${safeAuthPath(target,locale,'home')}`;
      },
    },
  };
}

type AuthExports=ReturnType<typeof NextAuth>;
let cached:AuthExports|null=null;

function instance():AuthExports|null {
  if(!authConfigured())return null;
  const url=canonicalAuthUrl(process.env.AUTH_URL,process.env.VERCEL);
  if(url)process.env.AUTH_URL=url;
  else delete process.env.AUTH_URL;
  cached??=NextAuth(buildAuthConfig);
  return cached;
}

export const handlers={
  GET:async(request:Request)=>{
    try{
      return await instance()?.handlers.GET(request as never)??Response.json({user:null});
    }catch{
      return Response.json({user:null});
    }
  },
  POST:async(request:Request)=>{
    try{
      return await instance()?.handlers.POST(request as never)??new Response(null,{status:503});
    }catch{
      return new Response(null,{status:503});
    }
  },
};

export async function auth():Promise<Session|null> {
  const current=instance();
  if(!current)return null;
  try{
    return await (current.auth as ()=>Promise<Session|null>)();
  }catch{
    return null;
  }
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
