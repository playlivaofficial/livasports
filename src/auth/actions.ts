'use server';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {authConfigured,emailAuthConfigured,googleAuthConfigured} from './database';
import {normalizeEmail} from './identity';
import {authCallbackUrl} from './redirect';
import {auth,signIn,signOut} from './config';
import {AuthRepository,sanitizeName} from './repository';
import {authDatabase} from './database';
import {authPath} from '@/localization/auth-copy';
import {isInterfaceLocale,type InterfaceLocale} from '@/localization/interface';
import {deferServerEvent} from '@/analytics/server';

function localeFrom(value:unknown):InterfaceLocale {
  return isInterfaceLocale(value)?value:'en';
}

export async function requestMagicLink(formData:FormData):Promise<{ok:true}> {
  const locale=localeFrom(formData.get('locale'));
  const email=normalizeEmail(formData.get('email'));
  if(!authConfigured()||!emailAuthConfigured()||!email)return {ok:true};
  try{
    // The provider's verification callback enforces the limit for this action AND direct Auth.js requests.
    await signIn('nodemailer',{email,redirect:false,redirectTo:authCallbackUrl(locale,formData.get('callbackUrl')||authPath(locale,'account'))});
  }catch{
    /* Generic response: never reveal delivery or account existence. */
  }
  return {ok:true};
}

export async function startGoogleSignIn(formData:FormData):Promise<void> {
  const locale=localeFrom(formData.get('locale'));
  if(!authConfigured()||!googleAuthConfigured())return;
  await signIn('google',{redirectTo:authCallbackUrl(locale,formData.get('callbackUrl')||authPath(locale,'account'))});
}

export async function signOutUser(formData:FormData):Promise<void> {
  const locale=localeFrom(formData.get('locale'));
  const session=await auth();
  await deferServerEvent({name:'sign_out_completed',headers:await headers(),locale,userId:session?.user?.id??null,canonicalPath:authPath(locale,'account')});
  await signOut({redirectTo:authPath(locale,'signin')});
}

export async function updateDisplayName(formData:FormData):Promise<void> {
  const locale=localeFrom(formData.get('locale'));
  const session=await auth();
  const id=session?.user?.id;if(!id)redirect(authPath(locale,'signin'));
  const name=sanitizeName(formData.get('name'));
  if(name)await new AuthRepository(authDatabase()).updateUser({id,name});
  redirect(authPath(locale,'account'));
}
