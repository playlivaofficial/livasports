// Read-only existing project health. No scheduler refresh is invoked.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno';
const g1=process.argv.includes('--g1');
try{const auth=JSON.parse(await readFile(join(process.env.APPDATA,'com.vercel.cli','Data','auth.json'),'utf8'));
  const headers={Authorization:`Bearer ${auth.token}`};const envResponse=await fetch(`https://api.vercel.com/v10/projects/${project}/env?teamId=${team}`,{headers});if(!envResponse.ok)throw Error('ENV_UNAVAILABLE');
  const env=await envResponse.json(),id=env.envs.find(e=>e.key==='CRON_SECRET'&&e.target.includes('production'))?.id;if(!id)throw Error('AUTH_UNAVAILABLE');
  const r=await fetch(`https://api.vercel.com/v1/projects/${project}/env/${encodeURIComponent(id)}?teamId=${team}`,{headers});if(!r.ok)throw Error('AUTH_UNAVAILABLE');const secret=await r.json();if(secret.decrypted!==true)throw Error('AUTH_UNAVAILABLE');
  const protectedHeaders={Authorization:`Bearer ${secret.value}`};const odds=await fetch('https://livasports.com/api/internal/odds-health',{headers:protectedHeaders}),commercial=await fetch('https://livasports.com/api/internal/affiliate-health',{headers:protectedHeaders});
  const o=await odds.json(),c=await commercial.json();
  const campaignPass=g1?c.campaigns.length===1&&c.campaigns.every(x=>x.bookmaker==='betsson'&&x.locale==='br'&&x.enabled&&x.approved&&x.geoEligible&&x.affiliateApproved&&x.campaignEligibleNow&&x.destinationConfigured&&x.destinationType==='SPORTSBOOK'&&x.approvedCreativeCount===0&&x.placements.length===3):c.campaigns.length===0;
  const pass=odds.status===200&&commercial.status===200&&o.automationEnabled===false&&o.automationOperational===false&&c.signingConfigured===true&&campaignPass&&!c.postbackOperational&&c.conversions.received_events==='0';
  const result={at:new Date().toISOString(),status:pass?'PASS':'FAIL',odds:{automationEnabled:o.automationEnabled,automationOperational:o.automationOperational,lastSuccessfulAutomatedRefreshAt:o.lastSuccessfulAutomatedRefreshAt,activeLease:o.activeLease},commercial:c,refreshInvocations:0};
  await writeFile(`output/${g1?'g1':'m8'}-production-operations-private.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(g1?{status:result.status,activeCampaigns:c.campaigns.length,campaignEligibleNow:campaignPass,signingConfigured:c.signingConfigured,conversionEvents:c.conversions.received_events,refreshInvocations:0,odds:result.odds}:result));if(!pass)process.exitCode=1;
}catch{console.error('M8_PROTECTED_OPERATIONS_QA_FAILED; no secrets logged');process.exitCode=1;}
