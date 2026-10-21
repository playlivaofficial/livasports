import Link from 'next/link';
import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {V2Shell} from '@/v2/pages';
import {Newsroom} from '@/editorial/Newsroom';
import {withNewsRepository} from '@/editorial/server';
import {withAutomation} from '@/editorial/automation/server';
import {NewsOperations} from '@/editorial/automation/Operations';
import {PrivateReviewEvidence} from '@/editorial/automation/ReviewEvidence';
export const dynamic='force-dynamic';
export const metadata={title:'Owner newsroom | LivaSports',robots:{index:false,follow:false}};
export default async function Page(){
  if(!requestOwnerSession(await headers()))return <OwnerHealthLogin configured={ownerConfigured()} title="LivaSports newsroom" subtitle="Private editorial publishing"/>;
  const records=await withNewsRepository(repo=>repo.listOwner()).catch(()=>null);
  const operations=await withAutomation(repo=>repo.dashboard()).catch(()=>null);
  return <V2Shell locale="en"><div className="v2-page-heading"><Link href="/owner/health">← Owner operations</Link><span className="v2-eyebrow">OWNER ONLY</span><h1>The newsroom.</h1><p>Original stories. Verified sources. Publish without a rebuild.</p></div><NewsOperations initial={operations}/><PrivateReviewEvidence/>{records?<Newsroom initial={records}/>:<p role="alert">The editorial database is temporarily unavailable. Existing publications and history are preserved. Please reload before editing.</p>}</V2Shell>;
}
