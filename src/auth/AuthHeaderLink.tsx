'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {authCopy,authPath} from '@/localization/auth-copy';
import type {InterfaceLocale} from '@/localization/interface';

export function AuthHeaderLink({locale}:{locale:InterfaceLocale}){
  const text=authCopy[locale];
  const [label,setLabel]=useState(text.headerSignIn);
  const [href,setHref]=useState(authPath(locale,'signin'));
  useEffect(()=>{
    let cancelled=false;
    fetch('/api/auth/session',{credentials:'same-origin'}).then(response=>response.ok?response.json():null).then(body=>{
      if(cancelled||!body?.user)return;
      const name=typeof body.user.name==='string'&&body.user.name.trim()?body.user.name.trim():typeof body.user.email==='string'?body.user.email.split('@')[0]:text.headerAccount;
      setLabel(name.slice(0,24));setHref(authPath(locale,'account'));
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[locale,text.headerAccount]);
  return <Link className="auth-header-link" href={href}>{label}</Link>;
}
