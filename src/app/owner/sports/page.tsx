import Link from 'next/link';
import {headers} from 'next/headers';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {OwnerHealthLogin} from '@/owner/HealthDashboard';
import {V2Shell} from '@/v2/pages';
import {withSportsRepository} from '@/multisport/server';
import {SnapshotDesk} from '@/multisport/SnapshotDesk';
import {CoverageDesk} from '@/multisport/CoverageDesk';
import {operationalCoverage} from '@/multisport/coverage';
export const dynamic='force-dynamic';
export const metadata={title:'Owner sports data | LivaSports',robots:{index:false,follow:false}};
export default async function Page(){
 if(!requestOwnerSession(await headers()))return <OwnerHealthLogin configured={ownerConfigured()} title="Sports data desk" subtitle="Private source verification and publishing"/>;
 const data=await withSportsRepository(async repo=>({records:await repo.listOwner(),refresh:await repo.refreshStatus()})).catch(()=>null);
 return <V2Shell locale="en"><div className="v2-page-heading"><Link href="/owner/health">← Owner operations</Link><span className="v2-eyebrow">OWNER ONLY</span><h1>Sports data desk.</h1><p>Dated sources. Validated snapshots. Preserved history.</p></div>{data?<><CoverageDesk rows={operationalCoverage(data.records,data.refresh,{automaticEnabled:process.env.V3_OPENLIGA_AUTOMATION_ENABLED==='true'})}/><SnapshotDesk initial={data.records} refresh={data.refresh}/></>:<p role="alert">Sports storage is unavailable. Nothing has been changed. Check migration 073 and database connectivity before importing.</p>}</V2Shell>;
}
