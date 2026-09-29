import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readAutopilotReport} from '@/seo-autopilot/report';
import {AutopilotDashboard} from '@/seo-autopilot/Dashboard';
import '../../../owner-health.css';
export const dynamic='force-dynamic';
export const metadata={title:'Owner SEO Autopilot',robots:{index:false,follow:false,nocache:true}};
export default async function Page({searchParams}:{searchParams:Promise<{days?:string}>}){
  if(!requestOwnerSession(await headers()))return <OwnerHealthLogin configured={ownerConfigured()} title="SEO Autopilot" subtitle="Acesso exclusivo do proprietário"/>;
  const days=Number((await searchParams).days),period=days===7||days===90?days:28;
  const url=databaseUrl();if(!url)return <main><h1>SEO Autopilot</h1><p>Banco indisponível.</p></main>;
  const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:20_000});
  const report=await readAutopilotReport(db,period).catch(()=>null).finally(()=>db.close());
  return report?<AutopilotDashboard report={report}/>:<main><h1>SEO Autopilot</h1><p>Relatório indisponível. Verifique o estado da migração.</p></main>;
}
