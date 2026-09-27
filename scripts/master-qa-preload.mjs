import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if(resolve(process.argv[1]??'')!==resolve(fileURLToPath(new URL('./master-qa.ts',import.meta.url))))throw Error('MASTER_QA_ENTRY_REQUIRED');
register('./g1-qa-server-only-loader.mjs',import.meta.url);
