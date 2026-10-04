import type { Metadata } from 'next';
import { ProfileRoutePage, profileMetadata } from '@/profiles/page';
export function generateMetadata({ params }: { params: Promise<{ profile: string }> }): Promise<Metadata> { return profileMetadata(params, 'mx', 'player'); }
export default function Page({ params }: { params: Promise<{ profile: string }> }) { return <ProfileRoutePage params={params} locale="mx" entity="player"/>; }

// Generate once on first request, then share only the public path-specific shell.
export const revalidate = 21600;
export function generateStaticParams(){return [];}
