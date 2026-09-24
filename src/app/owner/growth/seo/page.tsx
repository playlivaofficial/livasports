import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readSeoReport} from '@/seo/report';
import {SeoDashboard} from '@/owner/SeoDashboard';
import '../../../owner-health.css';
import '../../../owner-growth-dashboard.css';

export const dynamic='force-dynamic';
export const metadata={title:'Owner SEO monitoring',robots:{index:false,follow:false,nocache:true}};

/** Owner-only SEO monitoring. Existing owner session; noindex; no provider calls; never public. */
export default async function OwnerSeoPage(){
  const h=await headers();
  if(!requestOwnerSession(h))return <OwnerHealthLogin configured={ownerConfigured()} title="SEO monitoring" subtitle="Indexação, sitemaps e Search Console · acesso exclusivo do proprietário"/>;
  const url=databaseUrl();
  if(!url)return <main className="owner-health"><h1>SEO monitoring</h1><p role="alert">Database is not configured.</p></main>;
  const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:25_000});
  const report=await readSeoReport(db).catch(()=>null).finally(()=>db.close());
  if(!report)return <main className="owner-health"><h1>SEO monitoring</h1><p role="alert">The SEO report could not be read. Try again shortly.</p></main>;
  return <SeoDashboard report={report}/>;
}
