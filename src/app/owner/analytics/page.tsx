import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {AnalyticsDashboard} from '@/owner/AnalyticsDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readAnalyticsReport,type ReportFilters} from '@/analytics/reporting';
import {parseFilters} from '@/analytics/filters';
import '../../owner-health.css';
export const dynamic='force-dynamic';
export const metadata={title:'Owner analytics',robots:{index:false,follow:false,nocache:true}};
/** Owner-only product analytics (P4). Existing owner session; noindex; excluded from sitemaps; no provider calls. */
export default async function OwnerAnalyticsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const h=await headers(),session=requestOwnerSession(h);
  if(!session)return <OwnerHealthLogin configured={ownerConfigured()}/>;
  const url=databaseUrl();
  if(!url)return <main className="owner-health"><h1>Owner analytics</h1><p role="alert">Database is not configured.</p></main>;
  const report=await loadReport(url,parseFilters(await searchParams));
  if(!report)return <main className="owner-health"><h1>Owner analytics</h1><p role="alert">Analytics could not be read. Try again shortly.</p></main>;
  return <AnalyticsDashboard report={report}/>;
}
async function loadReport(url:string,filters:ReportFilters){
  const db=new PostgresDatabaseClient(url);
  try{return await readAnalyticsReport(db,filters);}catch{return null;}finally{await db.close();}
}
