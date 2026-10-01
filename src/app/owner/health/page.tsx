import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthDashboard,OwnerHealthLogin} from '@/owner/HealthDashboard';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readReliabilityHealth} from '@/odds/reliability/read';
import {StandingsHealth} from '@/sports/StandingsHealth';
import '../../owner-health.css';
export const dynamic='force-dynamic';
export const metadata={title:'Owner health',robots:{index:false,follow:false,nocache:true}};
/** Owner-only reliability dashboard (P3 §15–§17). Renders from the database only; never calls the odds provider. */
export default async function OwnerHealthPage(){
  const h=await headers(),session=requestOwnerSession(h);
  if(!session)return <OwnerHealthLogin configured={ownerConfigured()}/>;
  const url=databaseUrl();
  if(!url)return <main className="owner-health"><h1>Owner health</h1><p role="alert">Database is not configured.</p></main>;
  const health=await loadHealth(url);
  if(!health)return <main className="owner-health"><h1>Owner health</h1><p role="alert">Health could not be read. Try again shortly.</p></main>;
  const standingsDb=new PostgresDatabaseClient(url);
  let standings;try{standings=await StandingsHealth({db:standingsDb});}finally{await standingsDb.close();}
  return <><OwnerHealthDashboard health={health}/>{standings}</>;
}
async function loadHealth(url:string){
  const db=new PostgresDatabaseClient(url);
  try{return await readReliabilityHealth(db);}catch{return null;}finally{await db.close();}
}
