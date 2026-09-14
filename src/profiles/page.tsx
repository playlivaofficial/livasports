import {languageAlternates,teamPath as interfaceTeamPath,playerPath as interfacePlayerPath} from '@/localization/interface';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { PlayerProfilePage, TeamProfilePage } from '@/components/profile/ProfilePage';
import type { SiteLocale } from '@/config/i18n';
import { loadPlayerProfile, loadTeamProfile } from './runtime';
import { parseProfileParam, playerPath, slugifyProfileName, teamPath } from './routes';
import {TeamHistoryPanel} from '@/sports/TeamHistoryPanel';

const localeTag = { br: 'pt-BR', mx: 'es-MX' } as const;
const metadataCopy = {
  br: { team: 'jogos, elenco e estatísticas', player: 'estatísticas, jogos e perfil', notFound: 'Perfil não encontrado', tail: 'Dados reais de futebol no LivaSports.' },
  mx: { team: 'partidos, plantilla y estadísticas', player: 'estadísticas, partidos y perfil', notFound: 'Perfil no encontrado', tail: 'Datos reales de fútbol en LivaSports.' },
} as const;

export async function profileMetadata(paramPromise: Promise<{ profile: string }>, locale: SiteLocale,
  entity: 'team' | 'player'): Promise<Metadata> {
  await connection();
  const { profile: param } = await paramPromise;
  const parsed = parseProfileParam(param);
  if (!parsed) return { title: metadataCopy[locale].notFound, robots: { index: false, follow: false } };
  const result = entity === 'team' ? await loadTeamProfile(parsed.publicId, locale) : await loadPlayerProfile(parsed.publicId, locale);
  if (result.kind === 'not-found') return { title: metadataCopy[locale].notFound, robots: { index: false, follow: false } };
  const profile = result.profile;
  const description = entity === 'team'
    ? `${profile.name}: ${metadataCopy[locale].team}. ${metadataCopy[locale].tail}`
    : `${profile.name}: ${metadataCopy[locale].player}. ${metadataCopy[locale].tail}`;
  const canonical = entity === 'team' ? teamPath(locale, profile.publicId, profile.name) : playerPath(locale, profile.publicId, profile.name);
  const br = entity === 'team' ? teamPath('br', profile.publicId, profile.name) : playerPath('br', profile.publicId, profile.name);
  const mx = entity === 'team' ? teamPath('mx', profile.publicId, profile.name) : playerPath('mx', profile.publicId, profile.name);
  return { title: `${profile.name}: ${metadataCopy[locale][entity]}`, description,
    robots: profile.indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical, languages: languageAlternates(br,mx,(entity==='team'?interfaceTeamPath:interfacePlayerPath)('en',profile.publicId,profile.name)) },
    openGraph: { type: 'website', siteName: 'LivaSports', title: profile.name, description, url: canonical,
      locale: localeTag[locale].replace('-', '_'), images: profile.imageUrl ? [{ url: profile.imageUrl, alt: profile.name }] : undefined },
    other: { 'content-language': localeTag[locale] } };
}

export async function ProfileRoutePage({ params, locale, entity,searchParams }: { params: Promise<{ profile: string }>; locale: SiteLocale; entity: 'team' | 'player';searchParams?:Promise<Record<string,string|string[]|undefined>> }) {
  await connection();
  const { profile: param } = await params;
  const parsed = parseProfileParam(param);
  if (!parsed) notFound();
  if (entity === 'team') {
    const result = await loadTeamProfile(parsed.publicId, locale);
    if (result.kind === 'not-found') notFound();
    if (parsed.slug !== slugifyProfileName(result.profile.name)) permanentRedirect(teamPath(locale, result.profile.publicId, result.profile.name));
    const canonical = `https://livasports.com${teamPath(locale,result.profile.publicId,result.profile.name)}`;
    const jsonLd = [{ '@context':'https://schema.org','@type':'SportsTeam',name:result.profile.name,url:canonical,
      logo:result.profile.imageUrl??undefined,foundingDate:result.profile.foundedYear?String(result.profile.foundedYear):undefined,
      location:result.profile.country?{'@type':'Place',name:result.profile.country}:undefined },
    { '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'LivaSports',item:`https://livasports.com/${locale}`},
      {'@type':'ListItem',position:2,name:result.profile.name,item:canonical}]}];
    return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/><TeamProfilePage locale={locale} profile={result.profile} history={<TeamHistoryPanel profile={result.profile} locale={locale} query={await searchParams??{}}/>}/></>;
  }
  const result = await loadPlayerProfile(parsed.publicId, locale);
  if (result.kind === 'not-found') notFound();
  if (parsed.slug !== slugifyProfileName(result.profile.name)) permanentRedirect(playerPath(locale, result.profile.publicId, result.profile.name));
  const canonical = `https://livasports.com${playerPath(locale,result.profile.publicId,result.profile.name)}`;
  const jsonLd = [{ '@context':'https://schema.org','@type':'Person',name:result.profile.name,url:canonical,
    image:result.profile.imageUrl??undefined,birthDate:result.profile.dateOfBirth??undefined,nationality:result.profile.nationality??undefined,
    height:result.profile.heightCm?`${result.profile.heightCm} cm`:undefined,weight:result.profile.weightKg?`${result.profile.weightKg} kg`:undefined },
  { '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'LivaSports',item:`https://livasports.com/${locale}`},
    {'@type':'ListItem',position:2,name:result.profile.name,item:canonical}]}];
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/><PlayerProfilePage locale={locale} profile={result.profile}/></>;
}
