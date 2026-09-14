// Standalone QA only; production server-only enforcement is unchanged.
import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const entries=['./sports-db-qa.ts','./sports-profile-qa.ts'].map(entry=>fileURLToPath(new URL(entry,import.meta.url)));
if(!process.argv[1]||!entries.includes(resolve(process.argv[1])))throw Error('SPORTS_QA_ENTRY_POINT_REQUIRED');
register('./g1-qa-server-only-loader.mjs',import.meta.url);
