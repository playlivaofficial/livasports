import {matchSeoDescription,matchSeoTitle,sportsMatchSchema} from '@/sports/match-seo';
import {ctrMatchMetadata} from '@/seo/ctr-variants';
import {readPublishedSeo} from '@/seo-autopilot/public';
import {factualMatchContent} from '@/seo-autopilot/content';
import {optimizationMetadata} from '@/seo-autopilot/optimization-metadata';
import {isFinishedMatchDecayed,noindexRobots} from '@/seo/policy';
import type { Metadata } from 'next';
import {loadPendingFixture} from '@/sports/runtime';
import {PendingMatch,pendingMetadata} from '@/sports/PendingMatch';
import { notFound, permanentRedirect } from 'next/navigation';
import { MatchCenter } from '@/components/match/MatchCenter';
import {JsonLd} from '@/seo/json-ld';
import {openGraphImages} from '@/seo/open-graph';
import type { SiteLocale } from '@/config/i18n';
import { loadPublicMatchCenter } from './runtime';
import { matchPath, parseMatchParam, slugifyMatch } from './routes';
import {languageAlternates,matchPath as interfaceMatchPath} from '@/localization/interface';

const localeTag = { br: 'pt-BR', mx: 'es-MX' } as const;

async function resolveMatch(param: string, locale: SiteLocale) {
  const parsed = parseMatchParam(param);
  if (!parsed) return { parsed: null, result: null };
  return { parsed, result: await loadPublicMatchCenter(parsed.publicId, locale) };
}

export async function matchMetadata(paramPromise: Promise<{ match: string }>, locale: SiteLocale): Promise<Metadata> {
  const { match: param } = await paramPromise;
  const { result,parsed } = await resolveMatch(param, locale);
  // Blocking metadata validates before the response can flush a 200 shell.
  // Canonical redirects belong to the page only, avoiding duplicate Location headers.
  if(!parsed)notFound();
  if (!result || result.kind === 'not-found'){
    const pending=await loadPendingFixture(parsed.publicId);
    if(pending)return pendingMetadata(locale,pending);
    notFound();
  }
  const { header } = result.match;
  const variant=ctrMatchMetadata(locale,result.match);
  const seo=await readPublishedSeo(header.id);
  const factual=locale==='br'&&seo?.title?factualMatchContent(result.match):null;
  const optimized=locale==='br'?optimizationMetadata(seo?.optimization_metadata,`${header.home.name} x ${header.away.name}`,header.status,header.kickoff):null;
  const title = variant?.title??optimized?.title??factual?.title??matchSeoTitle(locale, header);
  const description = variant?.description??optimized?.description??factual?.description??matchSeoDescription(locale, header);
  const canonical = matchPath(locale, header.publicId, header.home.name, header.away.name);
  const br = matchPath('br', header.publicId, header.home.name, header.away.name);
  const mx = matchPath('mx', header.publicId, header.home.name, header.away.name);
  // M1 decay: a finished match past the boundary keeps its route, content and internal links but stops
  // asking to be indexed, and like every other noindex surface it emits no hreflang cluster.
  const decayed = isFinishedMatchDecayed(header.status, header.kickoff)&&!seo?.retain_indexable;
  return { title, description, ...(decayed ? { robots: noindexRobots } : {}),
    alternates: decayed ? { canonical } : { canonical, languages: languageAlternates(br,mx,interfaceMatchPath('en',header.publicId,header.home.name,header.away.name)) },
    openGraph: { type: 'website', siteName: 'LivaSports', title, url: canonical, locale: localeTag[locale].replace('-','_'),
      description, images: openGraphImages() }, other: { 'content-language': localeTag[locale] } };
}

export async function MatchRoutePage({ params, locale }: { params: Promise<{ match: string }>; locale: SiteLocale }) {
  const { match: param } = await params;
  const { parsed, result } = await resolveMatch(param, locale);
  if(!parsed)notFound();
  if(!result||result.kind==='not-found'){const pending=await loadPendingFixture(parsed.publicId);if(pending)return <PendingMatch locale={locale} row={pending}/>;notFound();}
  const correctSlug = slugifyMatch(result.match.header.home.name, result.match.header.away.name);
  if (param !== `${correctSlug}-${result.match.header.publicId}`) permanentRedirect(matchPath(locale, parsed.publicId, result.match.header.home.name, result.match.header.away.name));
  const jsonLd=sportsMatchSchema(locale,result.match.header);
  return <><JsonLd data={jsonLd}/><MatchCenter locale={locale} match={result.match}/></>;
}
