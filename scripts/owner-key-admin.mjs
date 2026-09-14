// Local-only administrator utility. It never writes or prints the plaintext key or its hash.
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const command=process.argv[2]??'prepare';
const artifact=resolve('output/hardening-owner-permanent-key.txt');
const requiredProject='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr';
const requiredTeam='team_rtsOqa3gRkQZwndpkXwyMDno';
const keyPattern=/^PERMANENT_OWNER_KEY=([A-Za-z0-9_-]{43,128})$/m;

async function permanentKey(){
  try{
    const saved=await readFile(artifact,'utf8'),match=keyPattern.exec(saved);
    if(!match)throw new Error('PRIVATE_OWNER_KEY_ARTIFACT_INVALID');
    return {key:match[1].trim(),created:false};
  }catch(error){
    if(error?.code!=='ENOENT')throw error;
    const key=randomBytes(32).toString('base64url');
    await mkdir(dirname(artifact),{recursive:true});
    await writeFile(artifact,[
      'LivaSports permanent owner QA access key',
      'PRIVATE — store this value in the owner password manager; never commit or share in reports.',
      'Previous owner access keys are obsolete.',
      'Created once: '+new Date().toISOString(),
      'PERMANENT_OWNER_KEY='+key,
      '',
    ].join('\n'),{encoding:'utf8',mode:0o600,flag:'wx'});
    return {key,created:true};
  }
}

const value=await permanentKey();
const hash=createHash('sha256').update(value.key.trim(),'utf8').digest('hex');
if(command==='prepare'){
  console.info(JSON.stringify({privateArtifact:'ready',created:value.created,previousKey:'obsolete',plaintextPrinted:false,hashPrinted:false}));
}else if(command==='update-production'){
  const project=JSON.parse(await readFile(resolve('.vercel/project.json'),'utf8'));
  if(project.projectId!==requiredProject||project.orgId!==requiredTeam)throw new Error('WRONG_VERCEL_PROJECT');
  const authPath=resolve(process.env.APPDATA??'', 'com.vercel.cli/Data/auth.json');
  const auth=JSON.parse(await readFile(authPath,'utf8'));
  if(typeof auth.token!=='string'||auth.token.length<20)throw new Error('VERCEL_AUTH_UNAVAILABLE');
  const query='teamId='+encodeURIComponent(requiredTeam);
  const headers={authorization:'Bearer '+auth.token,'content-type':'application/json'};
  const listed=await fetch(`https://api.vercel.com/v10/projects/${requiredProject}/env?${query}`,{headers});
  if(!listed.ok)throw new Error('VERCEL_ENV_LIST_FAILED_'+listed.status);
  const environments=(await listed.json()).envs??[];
  const target=environments.find(item=>item.key==='OWNER_QA_ACCESS_HASH'&&item.target?.includes('production'));
  if(!target?.id)throw new Error('OWNER_QA_ACCESS_HASH_NOT_FOUND');
  const updated=await fetch(`https://api.vercel.com/v9/projects/${requiredProject}/env/${target.id}?${query}`,{
    method:'PATCH',headers,body:JSON.stringify({value:hash,type:'sensitive',target:['production']}),
  });
  if(!updated.ok)throw new Error('VERCEL_ENV_UPDATE_FAILED_'+updated.status);
  console.info(JSON.stringify({projectId:requiredProject,environment:'production',accessHash:'updated',sessionSecret:'unchanged',plaintextPrinted:false,hashPrinted:false}));
}else throw new Error('UNKNOWN_COMMAND');
