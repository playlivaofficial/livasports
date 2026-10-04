import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {requestCountry} from '@/odds/commercial-geo';
import {PreviewControls} from '@/owner/PreviewControls';
export const dynamic='force-dynamic';
export const metadata={title:'Owner preview',robots:{index:false,follow:false}};
export default async function OwnerPreviewPage(){const h=await headers(),session=requestOwnerSession(h);return <PreviewControls authorized={!!session} preview={session?.preview??false} previewGeo={session?.previewGeo} configured={ownerConfigured()} country={requestCountry(h)}/>;}
