import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {CommercialActivation} from '@/owner/CommercialActivation';
import {commercialOwnerDatabase,readCommercialOperators} from '@/affiliate/owner-commercial';
import './commercial.css';
export const dynamic='force-dynamic';
export const metadata={title:'Commercial Activation · LivaSports',robots:{index:false,follow:false}};
export default async function CommercialPage(){
  if(!requestOwnerSession(await headers()))return <OwnerHealthLogin configured={ownerConfigured()} title="Commercial Activation" subtitle="Owner access only"/>;
  let operators;try{operators=await readCommercialOperators(commercialOwnerDatabase());}catch{/* Preserve fail-closed commercial state on DB failure. */}
  return operators?<CommercialActivation operators={operators}/>:<main className="commercial-owner"><h1>Commercial Activation</h1><p>Configuration is temporarily unavailable. No commercial state has changed.</p></main>;
}
