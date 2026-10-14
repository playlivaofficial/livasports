import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if(resolve(process.argv[1]??'')!==resolve(fileURLToPath(new URL('./geo-top5-cli.ts',import.meta.url))))throw Error('GEO_TOP5_CLI_ONLY');
register('./g1-qa-server-only-loader.mjs',import.meta.url);
