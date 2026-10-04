import type { Metadata } from 'next';
import { ProfileRoutePage, profileMetadata } from '@/profiles/page';
export function generateMetadata({ params }: { params: Promise<{ profile: string }> }): Promise<Metadata> { return profileMetadata(params, 'br', 'team'); }
export default function Page({ params,searchParams }: { params: Promise<{ profile: string }>;searchParams:Promise<Record<string,string|string[]|undefined>> }) { return <ProfileRoutePage params={params} searchParams={searchParams} locale="br" entity="team"/>; }

// Generate once on first request, then share only the public path-specific shell.
export const revalidate = 3600;
export function generateStaticParams(){return [];}
