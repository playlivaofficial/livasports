import {interfaceRoutes,isInterfaceLocale,pathLocale,type InterfaceLocale} from '@/localization/interface';
import {authRoutes} from '@/localization/auth-copy';
import {favoritesRoutes} from '@/localization/favorites-copy';

const allowed=new Set<string>([
  ...Object.values(interfaceRoutes).flatMap(r=>Object.values(r)),
  ...Object.values(authRoutes).flatMap(r=>[r.signin,r.account]),
  ...Object.values(favoritesRoutes).flatMap(r=>[r.myMatches]),
]);

export function safeAuthPath(value:unknown,locale:InterfaceLocale,fallback:'home'|'signin'|'account'='home'):string {
  const home=fallback==='signin'?authRoutes[locale].signin:fallback==='account'?authRoutes[locale].account:interfaceRoutes[locale].home;
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return home;
  let url:URL;
  try{url=new URL(value,'https://livasports.com');}catch{return home;}
  if(url.username||url.password||url.origin!=='https://livasports.com')return home;
  const local=pathLocale(url.pathname);
  if(!local||!isInterfaceLocale(local))return home;
  const pathname=url.pathname.replace(/\/+$/,'')||`/${local}`;
  if(!allowed.has(pathname)&&!allowed.has(url.pathname))return home;
  return pathname+(url.search||'')+(url.hash||'');
}

export function authCallbackUrl(locale:InterfaceLocale,requested:unknown):string {
  return safeAuthPath(requested,locale,'account');
}
