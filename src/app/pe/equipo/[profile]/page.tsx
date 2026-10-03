import type { Metadata } from 'next';
import { ProfileRoutePage, profileMetadata } from '@/profiles/page';
export const dynamic = 'force-dynamic';
export function generateMetadata({ params }: { params: Promise<{ profile: string }> }): Promise<Metadata> { return profileMetadata(params, 'pe', 'team'); }
export default function Page({ params,searchParams }: { params: Promise<{ profile: string }>;searchParams:Promise<Record<string,string|string[]|undefined>> }) { return <ProfileRoutePage params={params} searchParams={searchParams} locale='pe' entity="team"/>; }
