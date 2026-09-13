import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const root = process.cwd();
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean);
const forbiddenPaths = files.filter(file => file!=='.env.example'&&/(^|\/)\.env(?:$|\.)|(^|\/)\.vercel\//i.test(file));
const textExtensions = new Set(['','.cjs','.css','.html','.js','.json','.md','.mjs','.sql','.ts','.tsx','.txt','.yml','.yaml']);
const textFiles = files.filter(file => textExtensions.has(extname(file).toLowerCase()));
const envFiles = readdirSync(root).filter(file => /^\.env(?:\.|$)/.test(file)&&file!=='.env.example');
const sensitiveNames = /(?:API_KEY|DATABASE_URL|POSTGRES_PASSWORD|PGPASSWORD|VERCEL_OIDC_TOKEN|CRON_SECRET|AFFILIATE_URL|AFFILIATE_DESTINATION|AFFILIATE_SIGNING_SECRET|OWNER_QA_SESSION_SECRET|OWNER_QA_ACCESS_HASH|OWNER_QA_ACCESS_KEY|POSTBACK_SECRET)$/;
const sensitiveValues = [];
function readRepositoryText(file) {
  try { return readFileSync(resolve(root,file),'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Unstaged deletions still exist in the index. Inspect that copy rather than
    // skipping the file or aborting the remaining credential checks.
    return execFileSync('git', ['show', `:${file}`], { cwd: root, encoding: 'utf8' });
  }
}
for(const [name,value] of Object.entries(process.env))if(sensitiveNames.test(name)&&value&&value.length>=12)sensitiveValues.push(value);
for (const file of envFiles) {
  // Private campaign JSON is configuration, never application source. Scan the
  // full destination and its opaque attribution segments without printing them.
  if(file.endsWith('.json')){
    let value;try{value=JSON.parse(readFileSync(resolve(root,file),'utf8'));}catch{throw Error('PRIVATE_JSON_SCAN_FAILED');}
    const walk=(node)=>{
      if(typeof node==='string'&&(node.startsWith('https://record.betsson.bet.br/')||node.startsWith('https://c.bannerflow.net/a/'))){
        const url=new URL(node);sensitiveValues.push(node,encodeURIComponent(node),node.replaceAll('&','&amp;'));
        for(const part of [...url.pathname.split('/'),...url.searchParams.values()])if(part.length>=8)sensitiveValues.push(part,encodeURIComponent(part));
      }else if(node&&typeof node==='object')for(const child of Object.values(node))walk(child);
    };walk(value);
    continue;
  }
  for (const line of readFileSync(resolve(root,file),'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || !sensitiveNames.test(match[1])) continue;
    const value = match[2].replace(/^['"]|['"]$/g,'').trim();
    if (value.length >= 12) sensitiveValues.push(value);
  }
}
const leaks = [];
for (const file of textFiles) {
  const content = readRepositoryText(file);
  const genericCredential = file !== 'scripts/secret-scan.mjs' &&
    (/postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i.test(content) || /api_token=(?!YOUR_TOKEN|<)/i.test(content));
  if (sensitiveValues.some(value => content.includes(value)) || genericCredential) leaks.push(file);
}
const clientFiles = textFiles.filter(file => /^src\/(app|components)\//.test(file));
const clientSecretReferences = clientFiles.filter(file => /SPORTMONKS_API_KEY|ODDSPAPI_API_KEY|DATABASE_URL|POSTGRES_PASSWORD|VERCEL_OIDC_TOKEN|AFFILIATE_SIGNING_SECRET|POSTBACK_SECRET/.test(readRepositoryText(file)));

const urlArg = process.argv.find(arg => arg.startsWith('--url='));
let remoteDocuments = 0;
let remoteLeaks = 0;
if (urlArg) {
  const base = new URL(urlArg.slice(6));
  const queue = [base.href];
  const visited = new Set();
  while (queue.length && visited.size < 50) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) continue;
    const content = await response.text();
    remoteDocuments++;
    if (sensitiveValues.some(value => content.includes(value))) remoteLeaks++;
    if (url === base.href) for (const match of content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
      const script = new URL(match[1],base); if (script.origin === base.origin) queue.push(script.href);
    }
  }
}

const result = { trackedOrUnignoredEnvironmentFiles: forbiddenPaths.length, credentialValueLeaks: leaks.length,
  clientSecretReferences: clientSecretReferences.length, remoteDocumentsScanned: remoteDocuments, remoteCredentialValueLeaks: remoteLeaks,
  pathViolations: forbiddenPaths, leakFiles: leaks, clientReferenceFiles: clientSecretReferences };
console.info(JSON.stringify(result));
if (forbiddenPaths.length || leaks.length || clientSecretReferences.length || remoteLeaks) process.exitCode = 1;
