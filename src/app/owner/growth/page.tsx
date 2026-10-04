import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readGrowthDashboard} from '@/growth/service';
import {GrowthQueue} from '@/growth/GrowthQueue';
import type {GrowthDashboard} from '@/growth/types';
import {isCoreGeo} from '@/config/geo';
import '../../owner-health.css';
import '../../owner-growth.css';

export const dynamic='force-dynamic';
export const metadata={title:'Owner growth queue',robots:{index:false,follow:false,nocache:true}};

export default async function OwnerGrowthPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const requested=(await searchParams).geo,geo=isCoreGeo(requested)?requested:'MX';
  const h=await headers();if(!requestOwnerSession(h))return <OwnerHealthLogin configured={ownerConfigured()} title="Traffic Engine" subtitle="Fila de crescimento · acesso exclusivo do proprietário"/>;
  const url=databaseUrl();if(!url)return <main className="owner-health"><h1>Traffic Engine</h1><p role="alert">Database is not configured.</p></main>;
  const db=new PostgresDatabaseClient(url);
  let dashboard:GrowthDashboard|null=null;
  try{dashboard=await readGrowthDashboard(db,new Date(),geo);}
  catch{dashboard=null;}
  finally{await db.close();}
  return dashboard?<GrowthQueue key={geo} dashboard={dashboard}/>:<main className="owner-health"><h1>Traffic Engine</h1><p role="alert">A fila não pôde ser carregada. Tente novamente.</p></main>;
}
