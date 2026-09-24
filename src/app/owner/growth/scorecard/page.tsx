import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readWeeklyScorecard} from '@/analytics/growth-report';
import {parseGrowthQuery,withoutRange} from '@/analytics/growth-filters';
import {WeeklyScorecardView} from '@/owner/growth-dashboard/GrowthDashboardView';
import '../../../owner-health.css';
import '../../../owner-growth-dashboard.css';

export const dynamic='force-dynamic';
export const metadata={title:'Owner weekly scorecard',robots:{index:false,follow:false,nocache:true}};

export default async function OwnerWeeklyScorecardPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const h=await headers();if(!requestOwnerSession(h))return <OwnerHealthLogin configured={ownerConfigured()} title="Weekly scorecard" subtitle="Resumo semanal · acesso exclusivo do proprietário"/>;
  const url=databaseUrl();if(!url)return <main className="owner-health"><h1>Weekly scorecard</h1><p role="alert">Database is not configured.</p></main>;
  const parsed=parseGrowthQuery(await searchParams),db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:25_000});
  const card=await readWeeklyScorecard(db,parsed.week,withoutRange(parsed.filters)).catch(()=>null).finally(()=>db.close());
  if(!card)return <main className="owner-health"><h1>Weekly scorecard</h1><p role="alert">The scorecard could not be read. Try again shortly.</p></main>;
  return <WeeklyScorecardView card={card} parsed={parsed}/>;
}
