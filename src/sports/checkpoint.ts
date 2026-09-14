import {writeFile,rename} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';

/** Keep the previous checkpoint readable while Windows sync/indexing briefly locks its replacement. */
export async function writeSportsCheckpoint(file:string,snapshot:string){
  const pending=file.replace(/\.json$/,'-pending.json');
  if(pending===file)throw new Error('Sports checkpoint must be a JSON file');
  await writeFile(pending,snapshot);
  await replaceSportsFile(pending,file);
}

export async function replaceSportsFile(pending:string,file:string){
  for(let attempt=0;;attempt++){
    try{await rename(pending,file);return;}
    catch(error){
      const code=error&&typeof error==='object'&&'code' in error?error.code:null;
      if(!['EPERM','EBUSY'].includes(String(code))||attempt===5)throw error;
      await setTimeout(100*2**attempt);
    }
  }
}
