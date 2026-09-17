import {currentUser} from '@/auth/session';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {favoritesCopy,favoritesPath} from '@/localization/favorites-copy';
import {languageAlternates,languageTags,type InterfaceLocale} from '@/localization/interface';
import {favoritesRepository} from './database';
import type {MyMatchRow} from './feed';
import {MyMatchesClient} from './MyMatchesClient';

export function myMatchesMetadata(locale:InterfaceLocale){
  const text=favoritesCopy[locale];
  const path=favoritesPath(locale);
  return {title:text.title,description:text.lead,alternates:{canonical:path,languages:languageAlternates(favoritesPath('br'),favoritesPath('mx'),favoritesPath('en'))}};
}

export async function MyMatchesPage({locale}:{locale:InterfaceLocale}){
  const text=favoritesCopy[locale];
  const user=await currentUser();
  let initial:MyMatchRow[]|null=null;
  if(user?.id){
    try{initial=await favoritesRepository().feedForUser(user.id,locale);}catch{initial=[];}
  }
  return <div lang={languageTags[locale]} className={`app-shell sports-shell${locale==='en'?' english-sports':''}`}>
    <SiteHeader locale={locale} activePage="football" contentId="my-matches-content"/>
    <main id="my-matches-content" className="page-container my-matches-page">
      <h1>{text.title}</h1>
      <p className="my-matches-lead">{text.lead}</p>
      <MyMatchesClient locale={locale} authenticated={Boolean(user?.id)} initial={initial}/>
    </main>
  </div>;
}
