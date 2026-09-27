import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {authorityDatabase} from '@/authority/server';
import {readAuthority} from '@/authority/repository';
import {AuthorityWorkspace} from '@/authority/AuthorityWorkspace';
import type {AuthorityReport} from '@/authority/model';
import '../../../owner-health.css';
import './authority.css';
export const dynamic='force-dynamic';
export const metadata={title:'Owner · Autoridade editorial',robots:{index:false,follow:false,nocache:true}};
export default async function AuthorityPage(){
 if(!requestOwnerSession(await headers()))return <OwnerHealthLogin configured={ownerConfigured()} title="Autoridade editorial" subtitle="Área exclusiva do proprietário"/>;
 let db:ReturnType<typeof authorityDatabase>|undefined,report:AuthorityReport|null=null;
 try{db=authorityDatabase();report=await readAuthority(db);}catch{report=null;}finally{await db?.close();}
 return report?<AuthorityWorkspace initial={JSON.parse(JSON.stringify(report))}/>:<main className="owner-health"><h1>Autoridade editorial</h1><p role="alert">Dados indisponíveis. Verifique a migração e tente novamente.</p></main>;
}
