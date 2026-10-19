import {currentUser} from '@/auth/session';
import Link from 'next/link';
import {authPath} from '@/localization/auth-copy';
import {favoritesPath} from '@/localization/favorites-copy';
import type {InterfaceLocale} from '@/localization/interface';
import {noindexRobots} from '@/seo/policy';
import {V2Shell} from '@/v2/pages';
import {tr,translated} from '@/v2/content';
import {SavedRecords,type StoredFavorite} from '@/v2/SavedRecords';
import {savedAccountRecords} from '@/v2/saved-records-server';
import {v2Path} from '@/v2/routes';
import {v2Copy} from '@/v2/copy';
const title=tr('Your saved records','Tus registros guardados','Seus registros salvos');
export function myMatchesMetadata(locale:InterfaceLocale){return {title:translated(title,locale),robots:noindexRobots,alternates:{canonical:favoritesPath(locale)}};}
export async function MyMatchesPage({locale}:{locale:InterfaceLocale}){
 const user=await currentUser();let records:StoredFavorite[]|null=null,error=false;
 if(user?.id){try{records=await savedAccountRecords(user.id,locale);}catch{error=true;}}
 return <V2Shell locale={locale}><div className="v2-page-heading"><h1>{translated(title,locale)}</h1><p>{translated(tr('Existing favorites are preserved. Live match and odds refreshes have ended.','Conservamos tus favoritos. Las actualizaciones de partidos y cuotas en vivo han finalizado.','Seus favoritos foram preservados. As atualizações de jogos e odds ao vivo foram encerradas.'),locale)}</p></div><SavedRecords locale={locale} records={records} error={error}/><p><Link className="v2-button v2-button-secondary" href={authPath(locale,user?'account':'signin')}>{user?translated(tr('Your account','Tu cuenta','Sua conta'),locale):translated(tr('Sign in','Iniciar sesión','Entrar'),locale)}</Link></p><p><Link href={v2Path(locale,'tools')}>{v2Copy(locale).fanTools} →</Link></p></V2Shell>;
}
