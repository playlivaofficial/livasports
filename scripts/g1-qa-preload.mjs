// CLI equivalent of the existing vi.mock('server-only', () => ({})) tests.
// Never load this from Next.js, NODE_OPTIONS, or a production entry point.
import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const entries=['g1-publisher-db-qa.ts','g1-commercial-qa.ts']
  .map(file=>fileURLToPath(new URL(file,import.meta.url)));
if(!process.argv[1]||!entries.includes(resolve(process.argv[1]))) {
  throw Error('G1_QA_ENTRY_POINT_REQUIRED');
}
register('./g1-qa-server-only-loader.mjs',import.meta.url);
