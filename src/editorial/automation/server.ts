import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {AutomationRepository} from './repository';
import type {CanaryScope} from './canary';
export async function withAutomation<T>(work:(repo:AutomationRepository)=>Promise<T>,canary?:CanaryScope):Promise<T>{
  const url=databaseUrl();if(!url)throw Error('AUTOMATION_STORAGE_UNAVAILABLE');
  const db=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:5000});
  try{return await work(new AutomationRepository(db,canary));}finally{await db.close();}
}
