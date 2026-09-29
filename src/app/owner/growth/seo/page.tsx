import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readSeoReport,readSeoSearchReport} from '@/seo/report';
import {SeoDashboard} from '@/owner/SeoDashboard';
import {readExperiments} from '@/seo/experiments';
import {readCtrOpportunities} from '@/seo/ctr-report';
import {readGscHealth} from '@/seo/gsc-health';
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
  // The Search Console side is read separately so a query failure there cannot blank the technical report.
  const report=await readSeoReport(db).catch(()=>null);
  const [search,experiments,opportunities,gscHealth]=await Promise.all([readSeoSearchReport(db).catch(()=>null),readExperiments(db).catch(()=>null),readCtrOpportunities(db).catch(()=>null),readGscHealth(db).catch(()=>null)]).finally(()=>db.close());
  if(!report)return <main className="owner-health"><h1>SEO monitoring</h1><p role="alert">The SEO report could not be read. Try again shortly.</p></main>;
  return <SeoDashboard report={report} search={search} experiments={experiments} opportunities={opportunities} gscHealth={gscHealth}/>;
}
