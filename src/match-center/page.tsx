import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { MatchCenter } from '@/components/match/MatchCenter';
import type { SiteLocale } from '@/config/i18n';
import { loadMatchCenter } from './runtime';
import { matchPath, parseMatchParam, slugifyMatch } from './routes';
import { teamPath } from '@/profiles/routes';

const localeTag = { br: 'pt-BR', mx: 'es-MX' } as const;
const metadataCopy = {
  br: { at: 'em', description: 'Placar, escalações, estatísticas, lances e contexto da partida.' },
  mx: { at: 'en', description: 'Marcador, alineaciones, estadísticas, eventos y contexto del partido.' },
} as const;

async function resolveMatch(param: string, locale: SiteLocale) {
  const parsed = parseMatchParam(param);
  if (!parsed) return { parsed: null, result: null };
  return { parsed, result: await loadMatchCenter(parsed.publicId, locale) };
}

export async function matchMetadata(paramPromise: Promise<{ match: string }>, locale: SiteLocale): Promise<Metadata> {
  await connection();
  const { match: param } = await paramPromise;
  const { result } = await resolveMatch(param, locale);
  if (!result || result.kind === 'not-found') return { title: 'Partida não encontrada', robots: { index: false, follow: false } };
  const { header } = result.match; const copy = metadataCopy[locale];
  const title = `${header.home.name} x ${header.away.name}`;
  const canonical = matchPath(locale, header.publicId, header.home.name, header.away.name);
  const br = matchPath('br', header.publicId, header.home.name, header.away.name);
  const mx = matchPath('mx', header.publicId, header.home.name, header.away.name);
  return { title, description: `${title} ${copy.at} ${header.competition}. ${copy.description}`,
    alternates: { canonical, languages: { 'pt-BR': br, 'es-MX': mx } },
    openGraph: { type: 'website', siteName: 'LivaSports', title, url: canonical, locale: localeTag[locale].replace('-','_'),
      description: `${header.competition} · ${copy.description}` }, other: { 'content-language': localeTag[locale] } };
}

export async function MatchRoutePage({ params, locale }: { params: Promise<{ match: string }>; locale: SiteLocale }) {
  await connection();
  const { match: param } = await params;
  const { parsed, result } = await resolveMatch(param, locale);
  if (!parsed || !result || result.kind === 'not-found') notFound();
  const correctSlug = slugifyMatch(result.match.header.home.name, result.match.header.away.name);
  if (parsed.slug !== correctSlug) permanentRedirect(matchPath(locale, parsed.publicId, result.match.header.home.name, result.match.header.away.name));
  const canonical = `https://livasports.com${matchPath(locale, parsed.publicId, result.match.header.home.name, result.match.header.away.name)}`;
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${result.match.header.home.name} x ${result.match.header.away.name}`,
    startDate: result.match.header.kickoff, eventStatus: result.match.header.status, url: canonical,
    homeTeam: { '@type': 'SportsTeam', name: result.match.header.home.name,
      url: `https://livasports.com${teamPath(locale,result.match.header.home.publicId,result.match.header.home.name)}` },
    awayTeam: { '@type': 'SportsTeam', name: result.match.header.away.name,
      url: `https://livasports.com${teamPath(locale,result.match.header.away.publicId,result.match.header.away.name)}` },
    location: result.match.header.venue ? { '@type': 'Place', name: result.match.header.venue, address: result.match.header.venueCity ?? undefined } : undefined },
  { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'LivaSports', item: `https://livasports.com/${locale}` },
    { '@type': 'ListItem', position: 2, name: result.match.header.competition },
    { '@type': 'ListItem', position: 3, name: `${result.match.header.home.name} x ${result.match.header.away.name}`, item: canonical },
  ] }];
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g,'\\u003c') }}/><MatchCenter locale={locale} match={result.match}/></>;
}
