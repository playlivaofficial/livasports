import {headers} from 'next/headers';
import {ownerPreview} from '@/owner/session';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'QA click confirmed',robots:{index:false,follow:false}};
// eslint-disable-next-line @next/next/no-html-link-for-pages -- Preserve a full document request across the private owner/session boundary.
export default async function QaClick(){if(!ownerPreview(await headers()))notFound();return <main className="owner-preview-page"><h1>QA_TEST · click confirmed</h1><p>This Brazil placement is working. The click stays in QA analytics and no operator conversion is sent.</p><a href="/br">Back to Brazil site</a><a href="/owner/preview">Owner controls</a></main>;}
