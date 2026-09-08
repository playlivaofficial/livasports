import type { Metadata } from 'next';
import { MatchRoutePage, matchMetadata } from '@/match-center/page';
export const dynamic = 'force-dynamic';
export function generateMetadata({ params }: { params: Promise<{ match: string }> }): Promise<Metadata> { return matchMetadata(params, 'br'); }
export default function Page({ params }: { params: Promise<{ match: string }> }) { return <MatchRoutePage params={params} locale="br"/>; }
