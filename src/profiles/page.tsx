import {withSpanishLocales} from '@/localization/spanish';
import {languageTags} from '@/localization/interface';
import {languageAlternates,teamPath as interfaceTeamPath,playerPath as interfacePlayerPath} from '@/localization/interface';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PlayerProfilePage, TeamProfilePage } from '@/components/profile/ProfilePage';
import type { SiteLocale } from '@/config/i18n';
import { loadPlayerProfile, loadTeamProfile } from './runtime';
import { parseProfileParam, playerPath, teamPath } from './routes';
import {TeamHistoryPanel} from '@/sports/TeamHistoryPanel';
import {JsonLd} from '@/seo/json-ld';
import {openGraphImages} from '@/seo/open-graph';
import {cache} from 'react';
import {ctrTeamMetadata} from '@/seo/ctr-variants';

// Metadata and the page body share one request-scoped read per profile.
const teamData=cache((id:string,locale:SiteLocale)=>loadTeamProfile(id,locale));
const playerData=cache((id:string,locale:SiteLocale)=>loadPlayerProfile(id,locale));

const localeTag = languageTags;
const metadataCopy = withSpanishLocales({
  br: { team: 'jogos, elenco e estatísticas', player: 'estatísticas, jogos e perfil', notFound: 'Perfil não encontrado', tail: 'Dados reais de futebol no LivaSports.' },
  mx: { team: 'partidos, plantilla y estadísticas', player: 'estadísticas, partidos y perfil', notFound: 'Perfil no encontrado', tail: 'Datos reales de fútbol en LivaSports.' },
} as const);

export async function profileMetadata(paramPromise: Promise<{ profile: string }>, locale: SiteLocale,
  entity: 'team' | 'player'): Promise<Metadata> {
  const { profile: param } = await paramPromise;
  const parsed = parseProfileParam(param);
  if (!parsed) notFound();
  const result = entity === 'team' ? await teamData(parsed.publicId, locale) : await playerData(parsed.publicId, locale);
  if (result.kind === 'not-found') notFound();
  const profile = result.profile;
  const variant=entity==='team'?ctrTeamMetadata(locale,profile.publicId,profile.name):null;
  const description = variant?.description??(entity === 'team'
    ? `${profile.name}: ${metadataCopy[locale].team}. ${metadataCopy[locale].tail}`
    : `${profile.name}: ${metadataCopy[locale].player}. ${metadataCopy[locale].tail}`);
  const canonical = entity === 'team' ? teamPath(locale, profile.publicId, profile.name) : playerPath(locale, profile.publicId, profile.name);
  const br = entity === 'team' ? teamPath('br', profile.publicId, profile.name) : playerPath('br', profile.publicId, profile.name);
  const mx = entity === 'team' ? teamPath('mx', profile.publicId, profile.name) : playerPath('mx', profile.publicId, profile.name);
  return { title: variant?.title??`${profile.name}: ${metadataCopy[locale][entity]}`, description,
    robots: profile.indexable ? { index: true, follow: true } : { index: false, follow: true },
    // P2 policy: a noindex profile keeps its canonical but no hreflang cluster.
    alternates: profile.indexable ? { canonical, languages: languageAlternates(br,mx,(entity==='team'?interfaceTeamPath:interfacePlayerPath)('en',profile.publicId,profile.name)) } : { canonical },
    openGraph: { type: 'website', siteName: 'LivaSports', title: profile.name, description, url: canonical,
      locale: localeTag[locale].replace('-', '_'), images: openGraphImages(profile.imageUrl ? { url: profile.imageUrl, alt: profile.name } : null) },
    other: { 'content-language': localeTag[locale] } };
}

export async function ProfileRoutePage({ params, locale, entity }: { params: Promise<{ profile: string }>; locale: SiteLocale; entity: 'team' | 'player';searchParams?:Promise<Record<string,string|string[]|undefined>> }) {
  const { profile: param } = await params;
  const parsed = parseProfileParam(param);
  if (!parsed) notFound();
  if (entity === 'team') {
    const result = await teamData(parsed.publicId, locale);
    if (result.kind === 'not-found') notFound();
    const path=teamPath(locale,result.profile.publicId,result.profile.name);
    if(param!==path.split('/').at(-1))permanentRedirect(path);
    const canonical = `https://livasports.com${path}`;
    const jsonLd = [{ '@context':'https://schema.org','@type':'SportsTeam',name:result.profile.name,url:canonical,
      logo:result.profile.imageUrl??undefined,foundingDate:result.profile.foundedYear?String(result.profile.foundedYear):undefined,
      location:result.profile.country?{'@type':'Place',name:result.profile.country}:undefined },
    { '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'LivaSports',item:`https://livasports.com/${locale}`},
      {'@type':'ListItem',position:2,name:result.profile.name,item:canonical}]}];
    return <><JsonLd data={jsonLd}/><TeamProfilePage locale={locale} profile={result.profile} history={<TeamHistoryPanel profile={result.profile} locale={locale}/>}/></>;
  }
  const result = await playerData(parsed.publicId, locale);
  if (result.kind === 'not-found') notFound();
  const path=playerPath(locale,result.profile.publicId,result.profile.name);
  if(param!==path.split('/').at(-1))permanentRedirect(path);
  const canonical = `https://livasports.com${path}`;
  const jsonLd = [{ '@context':'https://schema.org','@type':'Person',name:result.profile.name,url:canonical,
    image:result.profile.imageUrl??undefined,birthDate:result.profile.dateOfBirth??undefined,nationality:result.profile.nationality??undefined,
    height:result.profile.heightCm?`${result.profile.heightCm} cm`:undefined,weight:result.profile.weightKg?`${result.profile.weightKg} kg`:undefined },
  { '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'LivaSports',item:`https://livasports.com/${locale}`},
    {'@type':'ListItem',position:2,name:result.profile.name,item:canonical}]}];
  return <><JsonLd data={jsonLd}/><PlayerProfilePage locale={locale} profile={result.profile}/></>;
}
