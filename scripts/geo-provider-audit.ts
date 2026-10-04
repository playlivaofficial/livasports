/** Bounded read-only remote audit; all attempts use the existing production budget ledger. No odds or account mutation. */
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {M5OddsPapiAdapter} from '../src/providers/oddspapi/M5OddsPapiAdapter';
import {startOddsJob,endOddsJob} from '../src/odds/ingestion';
const db=new PostgresDatabaseClient(databaseUrl()!);
let job:string|null=null;
try{
  job=await startOddsJob(db);
  const provider=new M5OddsPapiAdapter(db,process.env.ODDSPAPI_API_KEY!,job,2,false,Date.now()+120000,[],0);
  const account=process.argv.includes('--catalog-only')?null:await provider.accountCoverage();
  const catalog=await provider.providerBookmakers();
  const rows=Array.isArray(catalog)?catalog:[];
  const safeBookmakers=rows.filter(row=>/betsson|codere|caliente|10bet|bwin|betano|betplay|inkabet|betsafe|bet365|playdoit|strendus|winpot/i.test(JSON.stringify(row)))
    .map(row=>Object.fromEntries(Object.entries(row as Record<string,unknown>).filter(([key,value])=>
      ['bookmakerId','bookmaker','bookmakerName','name','slug','country','countryCode','active'].includes(key)&&['string','number','boolean'].includes(typeof value))));
  console.info(JSON.stringify({requests:provider.requestCount(),account,bookmakers:safeBookmakers}));
  await endOddsJob(db,job,true);job=null;
}catch(error){
  // Credentials/URLs/provider error bodies never appear in this audit output.
  let code=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'PROVIDER_AUDIT_FAILED';
  if(error instanceof Error){try{const parsed=JSON.parse(error.message);if(Number.isInteger(parsed.status))code=`PROVIDER_HTTP_${parsed.status}`;}catch{/* No raw body or error text is emitted. */}}
  console.info(JSON.stringify({status:'blocked',error:code}));
  if(job)await endOddsJob(db,job,false);
  process.exitCode=1;
}finally{await db.close();}
