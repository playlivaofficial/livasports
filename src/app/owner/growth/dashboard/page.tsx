import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readGrowthReport} from '@/analytics/growth-report';
import {parseGrowthQuery} from '@/analytics/growth-filters';
import {GrowthDashboardView} from '@/owner/growth-dashboard/GrowthDashboardView';
import '../../../owner-health.css';
import '../../../owner-growth-dashboard.css';

export const dynamic='force-dynamic';
export const metadata={title:'Owner growth dashboard',robots:{index:false,follow:false,nocache:true}};

/** Owner-only Growth Dashboard. Existing owner session; noindex; no provider calls; HUMAN traffic only. */
export default async function OwnerGrowthDashboardPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const h=await headers();if(!requestOwnerSession(h))return <OwnerHealthLogin configured={ownerConfigured()} title="Growth dashboard" subtitle="Tráfego, engajamento e cliques · acesso exclusivo do proprietário"/>;
  const url=databaseUrl();if(!url)return <main className="owner-health"><h1>Growth dashboard</h1><p role="alert">Database is not configured.</p></main>;
  const parsed=parseGrowthQuery(await searchParams),db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:25_000});
  const report=await readGrowthReport(db,parsed.filters).catch(()=>null).finally(()=>db.close());
  if(!report)return <main className="owner-health"><h1>Growth dashboard</h1><p role="alert">The dashboard could not be read. Try again shortly.</p></main>;
  return <GrowthDashboardView report={report} parsed={parsed}/>;
}
