import {headers} from 'next/headers';
import {ownerPreview} from '@/owner/session';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'QA click confirmed',robots:{index:false,follow:false}};
export default async function QaClick(){const session=ownerPreview(await headers());if(!session?.previewGeo)notFound();return <main className="owner-preview-page"><h1>QA_TEST · click confirmed</h1><p>This {session.previewGeo} placement is working. The click stays in QA analytics and no operator conversion is sent.</p><a href={'/'+session.previewGeo.toLowerCase()}>Back to preview site</a><a href="/owner/preview">Owner controls</a></main>;}
