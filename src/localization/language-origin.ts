import type {NextRequest} from 'next/server';

/** NextURL normalizes loopback names; never let that move a language cookie to another origin. */
export function languagePostOrigin(request:NextRequest,env:Readonly<Record<string,string|undefined>>=process.env):string|null {
  const supplied=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
  if(!supplied||(site!==null&&site!=='same-origin'))return null;
  let origin:URL;try{origin=new URL(supplied);}catch{return null;}
  if(origin.origin!==supplied||!['http:','https:'].includes(origin.protocol))return null;
  const expected=request.nextUrl;
  if(expected.hostname!=='localhost')return supplied===expected.origin?supplied:null;
  const host=request.headers.get('host');
  // Preserve the existing exact-origin production rule. Also reject cross-alias requests.
  if(supplied===expected.origin&&(!host||host===origin.host))return supplied;
  if(env.NODE_ENV==='production'||env.VERCEL==='1'||!host)return null;
  // The browser controls Origin and sends the actual destination Host; forwarded hosts
  // are deliberately ignored. Only a local development URL with the same port qualifies.
  let destination:URL;try{destination=new URL(`${expected.protocol}//${host}`);}catch{return null;}
  if(destination.host!==host||!['localhost','127.0.0.1','[::1]'].includes(destination.hostname)||destination.port!==expected.port||origin.protocol!==expected.protocol||supplied!==destination.origin)return null;
  return supplied;
}
