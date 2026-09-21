/** Read-only contextual identity review. Never fetches a provider or weakens match tolerance. */
import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {canonicalFixtures} from '../src/odds/ingestion';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
 const fixtures=await canonicalFixtures(db);
 const rows=(await db.query(`SELECT DISTINCT ON(provider_fixture_id) provider_fixture_id,evidence FROM odds_native_diagnostics
 WHERE classification='IDENTITY_UNRESOLVED' AND (evidence->>'kickoff')::timestamptz>now() ORDER BY provider_fixture_id,observed_at DESC`)).rows;
 const review=rows.map(r=>({...r,candidates:fixtures.filter(f=>(r.evidence.candidates??[]).includes(f.id)).map(f=>({id:f.id,competition:f.competition,home:f.home,away:f.away,kickoff:f.kickoff}))}));
 await writeFile('output/continuity-identity-review-private.json',JSON.stringify(review,null,2));
 console.log(JSON.stringify(review.filter(r=>r.evidence.reason!=='Kickoff differs by more than ten minutes; no auto-correction')));
}finally{await db.close();}
