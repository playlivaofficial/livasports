'use client';
import {useState} from 'react';
import {requestMagicLink,startGoogleSignIn} from '@/auth/actions';
import {authCopy} from '@/localization/auth-copy';
import type {InterfaceLocale} from '@/localization/interface';
import {track} from '@/analytics/client';

export function SignInForm({locale,google,email,callbackUrl}:{locale:InterfaceLocale;google:boolean;email:boolean;callbackUrl:string}){
  const text=authCopy[locale];
  const [sent,setSent]=useState(false);
  if(!google&&!email)return <p className="auth-unavailable">{text.unavailable}</p>;
  return <div className="auth-methods">
    {google?<form action={startGoogleSignIn} onSubmit={()=>track('sign_in_started',{},{dedupeKey:'google',props:{method:'google'}})}><input type="hidden" name="locale" value={locale}/><input type="hidden" name="callbackUrl" value={callbackUrl}/>
      <button type="submit" className="auth-google">{text.google}</button></form>:null}
    {google&&email?<p className="auth-or">{locale==='en'?'or':locale==='br'?'ou':'o'}</p>:null}
    {email?<form action={async formData=>{track('sign_in_started',{},{dedupeKey:'email',props:{method:'email'}});await requestMagicLink(formData);setSent(true);}} className="auth-email-form">
      <p className="auth-method-label">{text.email}</p>
      <input type="hidden" name="locale" value={locale}/><input type="hidden" name="callbackUrl" value={callbackUrl}/>
      <label><span>{text.emailLabel}</span><input type="email" name="email" required autoComplete="email" inputMode="email" placeholder={text.emailPlaceholder} maxLength={254}/></label>
      <button type="submit">{text.sendLink}</button>
      {sent?<p className="auth-check" role="status">{text.checkInbox}</p>:null}
    </form>:null}
  </div>;
}
