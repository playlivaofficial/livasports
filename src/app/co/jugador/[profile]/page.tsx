import type { Metadata } from 'next';
import { ProfileRoutePage, profileMetadata } from '@/profiles/page';
export const dynamic = 'force-dynamic';
export function generateMetadata({ params }: { params: Promise<{ profile: string }> }): Promise<Metadata> { return profileMetadata(params, 'co', 'player'); }
export default function Page({ params }: { params: Promise<{ profile: string }> }) { return <ProfileRoutePage params={params} locale='co' entity="player"/>; }
