// Creates only a first-party signing key, never operator commercial credentials.
import {readFile,appendFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
const project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno';
try{
  const auth=JSON.parse(await readFile(join(process.env.APPDATA,'com.vercel.cli','Data','auth.json'),'utf8'));
  const headers={Authorization:`Bearer ${auth.token}`,'content-type':'application/json'};
  const endpoint=`https://api.vercel.com/v10/projects/${project}/env?teamId=${team}`;
  const existing=await fetch(endpoint,{headers});if(!existing.ok)throw Error('ENV_READ_FAILED');const list=await existing.json();
  const keyName='AFFILIATE_SIGNING_SECRET',remote=list.envs.filter(e=>e.key===keyName);
  if(!remote.length){const value=randomBytes(32).toString('base64url');const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({key:keyName,value,type:'sensitive',target:['production','preview'],comment:'M8 first-party short-lived offer signatures; not an operator credential'})});if(!r.ok)throw Error('ENV_CREATE_FAILED');}
  const local=await readFile('.env.local','utf8');if(!/^AFFILIATE_SIGNING_SECRET=/m.test(local))await appendFile('.env.local',`\nAFFILIATE_SIGNING_SECRET=${randomBytes(32).toString('base64url')}\n`);
  const verified=await fetch(endpoint,{headers});if(!verified.ok)throw Error('ENV_VERIFY_FAILED');const final=await verified.json();const keys=final.envs.filter(e=>e.key===keyName);
  if(!['production','preview'].every(t=>keys.some(e=>e.target.includes(t))))throw Error('ENV_TARGET_MISSING');
  console.log(JSON.stringify({project,signingConfigured:true,targets:['production','preview'],localSigningConfigured:true,operatorDestinationCreated:false}));
}catch{console.error('M8_SECURITY_SETUP_FAILED; no secret values logged');process.exitCode=1;}
