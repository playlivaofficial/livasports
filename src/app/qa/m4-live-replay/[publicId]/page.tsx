import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { MatchCenter } from '@/components/match/MatchCenter';
import { loadMatchCenter } from '@/match-center/runtime';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'M4 live replay QA', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  await connection();
  const { publicId } = await params;
  const result = await loadMatchCenter(publicId, 'br');
  if (result.kind === 'not-found') notFound();
  return <MatchCenter locale="br" match={result.match} replay />;
}
