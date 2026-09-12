// Read-only verification of the EXISTING production scheduler. Never invokes a refresh.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const auth=JSON.parse(await readFile(join(process.env.APPDATA,'com.vercel.cli','Data','auth.json'),'utf8'));
const response=await fetch('https://api.vercel.com/v10/projects/prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr/env?teamId=team_rtsOqa3gRkQZwndpkXwyMDno',{headers:{Authorization:`Bearer ${auth.token}`}});
if(!response.ok)throw Error('EXISTING_PROJECT_ENV_READ_FAILED');const env=await response.json();
const id=env.envs.find(e=>e.key==='CRON_SECRET'&&e.target.includes('production'))?.id;
if(!id)throw Error('SCHEDULER_AUTH_UNAVAILABLE');
// Official Vercel decrypted-value endpoint; list-env returns ciphertext.
const decryptedResponse=await fetch(`https://api.vercel.com/v1/projects/prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr/env/${encodeURIComponent(id)}?teamId=team_rtsOqa3gRkQZwndpkXwyMDno`,{headers:{Authorization:`Bearer ${auth.token}`}});
if(!decryptedResponse.ok)throw Error('SCHEDULER_AUTH_UNAVAILABLE');
const decrypted=await decryptedResponse.json();if(decrypted.decrypted!==true)throw Error('SCHEDULER_AUTH_UNAVAILABLE');const cron=decrypted.value;
if(typeof cron!=='string'||cron.length<32)throw Error('SCHEDULER_AUTH_UNAVAILABLE');
const healthResponse=await fetch('https://livasports.com/api/internal/odds-health',{headers:{Authorization:`Bearer ${cron}`}});
const health=await healthResponse.json();
const result={at:new Date().toISOString(),status:healthResponse.status,automationEnabled:health.automationEnabled,automationOperational:health.automationOperational,
  lastSuccessfulAutomatedRefreshAt:health.lastSuccessfulAutomatedRefreshAt,activeLease:health.activeLease,refreshInvocations:0};
console.log(JSON.stringify(result));await writeFile('output/m7-operations-private.json',JSON.stringify(result,null,2));
if(result.status!==200||result.automationEnabled!==false||result.automationOperational!==false||result.lastSuccessfulAutomatedRefreshAt!==null)process.exitCode=1;
