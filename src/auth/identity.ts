export const USER_SESSION_COOKIE='livasports-user';
export const USER_SESSION_COOKIE_SECURE='__Secure-livasports-user';
export const MAGIC_LINK_TTL_SECONDS=10*60;
export const SESSION_TTL_SECONDS=30*24*60*60;
export const DISPLAY_NAME_MAX=80;

export function normalizeEmail(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const email=value.trim().toLowerCase();
  if(!email||email.length>254||email.includes('\n')||email.includes('\r'))return null;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
  return email;
}

export function canonicalAuthUrl(authUrl=process.env.AUTH_URL, vercel=process.env.VERCEL):string {
  const value=authUrl?.trim()??'';
  if(/^https:\/\/livasports\.com\/?$/i.test(value))return 'https://livasports.com';
  try{
    const parsed=new URL(value);
    if(parsed.protocol==='https:'||parsed.protocol==='http:')return `${parsed.protocol}//${parsed.host}`;
  }catch{/* AUTH_URL must be a public origin, never a client secret or other opaque value. */}
  return vercel==='1'?'https://livasports.com':'';
}

export function userSessionCookieName(secure:boolean):string {
  return secure?USER_SESSION_COOKIE_SECURE:USER_SESSION_COOKIE;
}

export function userSessionCookieOptions(secure:boolean){
  return {httpOnly:true,sameSite:'lax' as const,path:'/',secure};
}

export function googleSignInAllowed(profile:unknown):boolean {
  if(!profile||typeof profile!=='object')return false;
  const value=profile as {email?:unknown;email_verified?:unknown;emailVerified?:unknown};
  const email=normalizeEmail(value.email);
  return !!email&&(value.email_verified===true||value.emailVerified===true);
}
