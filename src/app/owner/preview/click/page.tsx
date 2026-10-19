import {headers} from 'next/headers';
import {requestOwnerSession} from '@/owner/session';
import {notFound} from 'next/navigation';
import {V2Shell} from '@/v2/pages';
export const dynamic='force-dynamic';
export const metadata={title:'Inactive affiliate slots',robots:{index:false,follow:false}};
export default async function QaClick(){if(!requestOwnerSession(await headers()))notFound();return <V2Shell locale="en"><div className="v2-page-heading"><h1>Affiliate actions are inactive</h1><p>No referral or conversion was sent. V2 campaigns must be verified and connected before activation.</p><a className="v2-button" href="/owner/preview">Owner preview</a></div></V2Shell>;}
