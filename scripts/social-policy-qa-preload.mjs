import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('./social-policy-qa.ts',import.meta.url));
if(!process.argv[1]||resolve(process.argv[1])!==resolve(entry))throw Error('SOCIAL_QA_ENTRY_POINT_REQUIRED');
register('./g1-qa-server-only-loader.mjs',import.meta.url);
