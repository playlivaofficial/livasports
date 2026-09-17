import {redirect} from 'next/navigation';
import Link from 'next/link';
import {authCopy,authPath} from '@/localization/auth-copy';
import {favoritesCopy,favoritesPath} from '@/localization/favorites-copy';
import {type InterfaceLocale} from '@/localization/interface';
import {authConfigured,emailAuthConfigured,googleAuthConfigured} from './database';
import {auth} from './config';
import {signOutUser,updateDisplayName} from './actions';
import {userProviders} from './session';
import {AuthShell} from './AuthShell';
import {SignInForm} from './SignInForm';
import {authCallbackUrl} from './redirect';
import {favoritesRepository} from '@/favorites/database';

export function authPageMetadata(locale:InterfaceLocale,kind:'signin'|'account'){
  const text=authCopy[locale];
  const path=authPath(locale,kind);
  return {title:kind==='signin'?text.signInTitle:text.accountTitle,robots:{index:false,follow:false},
    alternates:{canonical:path}};
}

export async function SignInPage({locale,searchParams}:{locale:InterfaceLocale;searchParams?:Promise<Record<string,string|string[]|undefined>>}){
  const session=await auth();
  if(session?.user?.id)redirect(authPath(locale,'account'));
  const query=searchParams?await searchParams:{};
  const callbackUrl=authCallbackUrl(locale,typeof query.callbackUrl==='string'?query.callbackUrl:authPath(locale,'account'));
  const text=authCopy[locale];
  return <AuthShell locale={locale} title={text.signInTitle} lead={text.signInLead}>
    <SignInForm locale={locale} google={authConfigured()&&googleAuthConfigured()} email={authConfigured()&&emailAuthConfigured()} callbackUrl={callbackUrl}/>
  </AuthShell>;
}

export async function AccountPage({locale}:{locale:InterfaceLocale}){
  const session=await auth();
  if(!session?.user?.id)redirect(authPath(locale,'signin'));
  const text=authCopy[locale];
  const user=session.user;
  const methods=await userProviders(user.id);
  const fav=favoritesCopy[locale];
  let counts={teams:0,competitions:0,fixtures:0};
  try{counts=await favoritesRepository().counts(user.id);}catch{}
  const initial=(user.name||user.email||'?').slice(0,1).toUpperCase();
  return <AuthShell locale={locale} title={text.accountTitle}>
    <section className="auth-account">
      <div className="auth-identity">
        {user.image?
          // OAuth avatars are arbitrary HTTPS URLs, not a configured image optimizer host.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="auth-avatar" src={user.image} alt="" width={48} height={48}/>:<span className="auth-avatar" aria-hidden="true">{initial}</span>}
        <div><strong>{user.name||text.noName}</strong><span>{user.email}</span></div>
      </div>
      <form className="auth-name" action={updateDisplayName}>
        <input type="hidden" name="locale" value={locale}/>
        <label><span>{text.displayName}</span><input name="name" defaultValue={user.name??''} required maxLength={80} autoComplete="nickname"/></label>
        <button type="submit">{text.saveName}</button>
      </form>
      <div><p>{text.methods}</p><ul className="auth-methods-list">{methods.map(method=><li key={method}>{method==='google'?text.googleMethod:text.emailMethod}</li>)}</ul></div>
      <div className="auth-favorites"><h2>{fav.accountTitle}</h2><ul><li>{fav.accountTeams}: {counts.teams}</li><li>{fav.accountCompetitions}: {counts.competitions}</li><li>{fav.accountMatches}: {counts.fixtures}</li></ul><Link href={favoritesPath(locale)}>{fav.accountLink}</Link></div>
      <p className="auth-reserved">{text.reserved}</p>
      <form action={signOutUser}><input type="hidden" name="locale" value={locale}/><button className="auth-signout" type="submit">{text.signOut}</button></form>
    </section>
  </AuthShell>;
}
