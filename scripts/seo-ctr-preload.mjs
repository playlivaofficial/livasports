import {register} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if(!['./seo-ctr-audit.ts','./seo-ctr-live.ts','./seo-ctr-release.ts'].some(entry=>resolve(process.argv[1]??'')===resolve(fileURLToPath(new URL(entry,import.meta.url)))))throw Error('SEO_AUDIT_ENTRY_REQUIRED');
register('./g1-qa-server-only-loader.mjs',import.meta.url);
