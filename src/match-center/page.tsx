import {matchSeoDescription,matchSeoTitle,sportsMatchSchema} from '@/sports/match-seo';
import {isFinishedMatchDecayed,noindexRobots} from '@/seo/policy';
import type { Metadata } from 'next';
import {loadPendingFixture} from '@/sports/runtime';
import {PendingMatch,pendingMetadata} from '@/sports/PendingMatch';
import { connection } from 'next/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { MatchCenter } from '@/components/match/MatchCenter';
import {JsonLd} from '@/seo/json-ld';
import {openGraphImages} from '@/seo/open-graph';
import type { SiteLocale } from '@/config/i18n';
import { loadMatchCenter } from './runtime';
import { matchPath, parseMatchParam, slugifyMatch } from './routes';
import {languageAlternates,matchPath as interfaceMatchPath} from '@/localization/interface';
import { headers } from 'next/headers';
import { commercialLocale, requestCommercialGeo } from '@/odds/commercial-geo';

const localeTag = { br: 'pt-BR', mx: 'es-MX' } as const;

async function resolveMatch(param: string, locale: SiteLocale) {
  const parsed = parseMatchParam(param);
  if (!parsed) return { parsed: null, result: null };
  return { parsed, result: await loadMatchCenter(parsed.publicId, locale) };
}

export async function matchMetadata(paramPromise: Promise<{ match: string }>, locale: SiteLocale): Promise<Metadata> {
  await connection();
  const { match: param } = await paramPromise;
  const { result,parsed } = await resolveMatch(param, locale);
  if (!result || result.kind === 'not-found'){const pending=parsed?await loadPendingFixture(parsed.publicId):null;return pending?pendingMetadata(locale,pending):{title:locale==='br'?'Partida não encontrada':'Partido no encontrado',robots:{index:false,follow:false}};}
  const { header } = result.match;
  const title = matchSeoTitle(locale, header);
  const description = matchSeoDescription(locale, header);
  const canonical = matchPath(locale, header.publicId, header.home.name, header.away.name);
  const br = matchPath('br', header.publicId, header.home.name, header.away.name);
  const mx = matchPath('mx', header.publicId, header.home.name, header.away.name);
  // M1 decay: a finished match past the boundary keeps its route, content and internal links but stops
  // asking to be indexed, and like every other noindex surface it emits no hreflang cluster.
  const decayed = isFinishedMatchDecayed(header.status, header.kickoff);
  return { title, description, ...(decayed ? { robots: noindexRobots } : {}),
    alternates: decayed ? { canonical } : { canonical, languages: languageAlternates(br,mx,interfaceMatchPath('en',header.publicId,header.home.name,header.away.name)) },
    openGraph: { type: 'website', siteName: 'LivaSports', title, url: canonical, locale: localeTag[locale].replace('-','_'),
      description, images: openGraphImages() }, other: { 'content-language': localeTag[locale] } };
}

export async function MatchRoutePage({ params, locale }: { params: Promise<{ match: string }>; locale: SiteLocale }) {
  await connection();
  const { match: param } = await params;
  const { parsed, result } = await resolveMatch(param, locale);
  if(!parsed)notFound();
  if(!result||result.kind==='not-found'){const pending=await loadPendingFixture(parsed.publicId);if(pending)return <PendingMatch locale={locale} row={pending}/>;notFound();}
  const correctSlug = slugifyMatch(result.match.header.home.name, result.match.header.away.name);
  if (parsed.slug !== correctSlug) permanentRedirect(matchPath(locale, parsed.publicId, result.match.header.home.name, result.match.header.away.name));
  const jsonLd=sportsMatchSchema(locale,result.match.header);
  return <><JsonLd data={jsonLd}/><MatchCenter locale={locale} commercialLocale={commercialLocale(requestCommercialGeo(await headers()))??locale} match={result.match}/></>;
}
