import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if(!process.argv[1]||resolve(process.argv[1])!==fileURLToPath(new URL('./authority-cli.ts',import.meta.url)))throw Error('AUTHORITY_CLI_ONLY');
register('./g1-qa-server-only-loader.mjs',import.meta.url);
