// Narrow QA-only replacement for Next's compile-time `server-only` guard, scoped to the motion QA harness.
import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('./growth-motion-qa.ts',import.meta.url));
if(!process.argv[1]||resolve(process.argv[1])!==resolve(entry))throw Error('GROWTH_MOTION_QA_ENTRY_POINT_REQUIRED');
register('./g1-qa-server-only-loader.mjs',import.meta.url);
